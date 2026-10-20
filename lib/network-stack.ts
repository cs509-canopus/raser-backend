import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { SHARED_VPC_NAME, DB_PORT } from "./config";

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly lambdaSecurityGroup: ec2.SecurityGroup;
  public readonly eicSecurityGroup: ec2.SecurityGroup;
  public readonly eicEndpointId: string;

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

    // A security group that will let us (developers) access the database from our own devices,
    // so we can run psql tools, test queries, etc., even though we are not in the VPC
    this.eicSecurityGroup = new ec2.SecurityGroup(this, "EicSg", {
      vpc: this.vpc,
      securityGroupName: "raser-eic-endpoint",
      description: "EC2 Instance Connect Endpoint (team DB tunnel)",
      allowAllOutbound: false,
    });

    // Allows inbound traffic to conect to the database port (5432) only
    this.eicSecurityGroup.addEgressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(DB_PORT),
      "Tunnel to Postgres only",
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

    // Print VPC and EicEndpoint ids on deploy
    new cdk.CfnOutput(this, "VpcId", { value: this.vpc.vpcId });
    new cdk.CfnOutput(this, "EicEndpointId", { value: this.eicEndpointId });

    new cdk.CfnOutput(this, "CreationMessage", {
      value: `Created NetworkStack`,
    });
  }
}
