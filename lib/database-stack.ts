import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";
import {
  SHARED_VPC_NAME,
  SHARED_LAMBDA_SG_NAME,
  SHARED_BASTION_SG_NAME,
  DB_PORT,
} from "./config";

export class DatabaseStack extends cdk.Stack {
  public readonly instance: rds.DatabaseInstance;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // find the shared VPC and security groups by name instead of importing NetworkStack
    const vpc = ec2.Vpc.fromLookup(this, "Vpc", { vpcName: SHARED_VPC_NAME });
    const lambdaSg = ec2.SecurityGroup.fromLookupByName(
      this,
      "LambdaSg",
      SHARED_LAMBDA_SG_NAME,
      vpc,
    );
    const bastionSg = ec2.SecurityGroup.fromLookupByName(
      this,
      "BastionSg",
      SHARED_BASTION_SG_NAME,
      vpc,
    );

    // db only needs ingress, nothing connects out from it
    const dbSg = new ec2.SecurityGroup(this, "DbSg", {
      vpc,
      securityGroupName: "raser-db",
      description: "Attached to the shared Postgres instance",
      allowAllOutbound: false,
    });
    dbSg.addIngressRule(
      lambdaSg,
      ec2.Port.tcp(DB_PORT),
      "Postgres from Lambdas",
    );
    dbSg.addIngressRule(
      bastionSg,
      ec2.Port.tcp(DB_PORT),
      "Postgres from the dev bastion",
    );

    const credentials = rds.Credentials.fromGeneratedSecret("raser_admin");

    this.instance = new rds.DatabaseInstance(this, "Postgres", {
      instanceIdentifier: "raser-shared-db",
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_4,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE4_GRAVITON,
        ec2.InstanceSize.MICRO,
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      credentials,
      multiAz: false,
      allocatedStorage: 20,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      publiclyAccessible: false,
      port: DB_PORT,
      backupRetention: cdk.Duration.days(7),
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
    });

    new cdk.CfnOutput(this, "DbEndpoint", {
      value: this.instance.dbInstanceEndpointAddress,
    });
    new cdk.CfnOutput(this, "DbSecretArn", {
      value: this.instance.secret?.secretArn ?? "none",
    });
  }
}
