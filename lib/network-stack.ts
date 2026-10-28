import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { SHARED_VPC_NAME, DB_PORT, SSH_PORT } from "./config";

const BASTION_IDLE_MINUTES = 30;

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly lambdaSecurityGroup: ec2.SecurityGroup;
  public readonly eicSecurityGroup: ec2.SecurityGroup;
  public readonly eicEndpointId: string;
  public readonly bastionSecurityGroup: ec2.SecurityGroup;
  public readonly bastion: ec2.Instance;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The private virtual private cloud
    this.vpc = new ec2.Vpc(this, "Vpc", {
      // Label for the VPC, used to access the VPC from other stages
      vpcName: SHARED_VPC_NAME,

      // Private IP address range for the entire VPC
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),

      // Spread subnets accross 2 availability zones (e.g., us-east-1a and us-east-1b), as required
      // by RDS
      maxAzs: 2,

      // Disable NAT gateways for cost savings. This means that constructs in the VPC can only
      // communicate with other constructs in the VPC and cannot access the outside internet
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "isolated",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],

      restrictDefaultSecurityGroup: true,
    });

    // Gateway endpoint that gives in-VPC Lambdas access to S3 without a NAT.
    this.vpc.addGatewayEndpoint("S3Endpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }],
    });

    // A security group for lambda functions that need access to the database
    this.lambdaSecurityGroup = new ec2.SecurityGroup(this, "LambdaSg", {
      vpc: this.vpc,
      securityGroupName: "raser-lambda-db-clients",
      description:
        "Attached to Lambdas (all stages) that need the shared database",
      allowAllOutbound: true, // only the VPC and the S3 endpoint are routable anyway
    });

    // An EC2 Instance Connect (Eic) security group that will allow access to the
    // database instance, so we can run psql tools, test queries, etc.,
    this.eicSecurityGroup = new ec2.SecurityGroup(this, "EicSg", {
      vpc: this.vpc,
      securityGroupName: "raser-eic-endpoint",
      description: "EC2 Instance Connect Endpoint (team DB tunnel)",
      allowAllOutbound: false,
    });

    // A security group for the bastion server
    this.bastionSecurityGroup = new ec2.SecurityGroup(this, "BastionSg", {
      vpc: this.vpc,
      securityGroupName: "raser-db-bastion",
      description: "SSH hop from the EIC endpoint to Postgres",
      allowAllOutbound: false,
    });

    // Allow connections leaving EicSg going to BastionSg on SSH port (22)
    this.eicSecurityGroup.addEgressRule(
      this.bastionSecurityGroup,
      ec2.Port.tcp(SSH_PORT),
      "SSH to bastion only",
    );

    // Allow connections arriving to BastionSg from EicSg on SSH port (22)
    this.bastionSecurityGroup.addIngressRule(
      this.eicSecurityGroup,
      ec2.Port.tcp(SSH_PORT),
      "SSH from EIC endpoint",
    );

    // Allow connections leaving BastionSg going to VPC on DB port (5432)
    this.bastionSecurityGroup.addEgressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(DB_PORT),
      "Forward to Postgres only",
    );

    // Gives access to people in the EicSg to the VPC subnet
    const eic = new ec2.CfnInstanceConnectEndpoint(
      this,
      "InstanceConnectEndpoint",
      {
        subnetId: this.vpc.isolatedSubnets[0].subnetId,
        securityGroupIds: [this.eicSecurityGroup.securityGroupId],
        preserveClientIp: false, // source IP = endpoint ENI, so SG-to-SG rules match
      },
    );
    this.eicEndpointId = eic.attrId;

    // Startup script for the bastion instance. Creates a raser-idle-stop script that triggers a
    // shutdown after 30 minutes of not being connect to any SSH connections, a raser-idle-stop
    // service to run the script, and a raser-idle-stop timer to run the service every 5 minutes
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      `cat > /usr/local/bin/raser-idle-stop <<'EOF'`,
      `#!/bin/bash`,
      `STAMP=/run/raser-last-active  # /run is cleared on boot, so every boot gets a fresh grace period`,
      `if [ ! -f "$STAMP" ] || ss -Htn state established '( sport = :${SSH_PORT} )' | grep -q .; then`,
      `  touch "$STAMP"; exit 0`,
      `fi`,
      `if [ $(( $(date +%s) - $(stat -c %Y "$STAMP") )) -ge ${BASTION_IDLE_MINUTES * 60} ]; then shutdown -h now; fi`,
      `EOF`,
      `chmod +x /usr/local/bin/raser-idle-stop`,
      `printf '[Service]\\nType=oneshot\\nExecStart=/usr/local/bin/raser-idle-stop\\n' > /etc/systemd/system/raser-idle-stop.service`,
      `printf '[Timer]\\nOnBootSec=5min\\nOnUnitActiveSec=5min\\n[Install]\\nWantedBy=timers.target\\n' > /etc/systemd/system/raser-idle-stop.timer`,
      `systemctl daemon-reload`,
      `systemctl enable --now raser-idle-stop.timer`,
    );

    // Bastion server EC2 instance, type t4g.micro (lowest cost type availalble
    // on free tier), ARM, running Amazon Linux
    this.bastion = new ec2.Instance(this, "Bastion", {
      instanceName: "raser-db-bastion",
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroup: this.bastionSecurityGroup,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE4_GRAVITON,
        ec2.InstanceSize.MICRO,
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      }),
      requireImdsv2: true,
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: ec2.BlockDeviceVolume.ebs(8, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
          }),
        },
      ],
      instanceInitiatedShutdownBehavior:
        ec2.InstanceInitiatedShutdownBehavior.STOP,
      userData,
    });

    // Print VPC, Eic Endpoint, and Bastion instance ids on deploy
    new cdk.CfnOutput(this, "VpcId", { value: this.vpc.vpcId });
    new cdk.CfnOutput(this, "EicEndpointId", { value: this.eicEndpointId });
    new cdk.CfnOutput(this, "BastionInstanceId", {
      value: this.bastion.instanceId,
    });

    new cdk.CfnOutput(this, "CreationMessage", {
      value: `Created NetworkStack`,
    });
  }
}
