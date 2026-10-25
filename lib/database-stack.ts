// lib/database-stack.ts — finalized draft for issue #12 (your assigned piece).
// Prepared by Kairo for Krishna Garg (WPI CS509, team cs509-canopus/raser-backend).
// NOT YET DROPPED INTO THE REPO. Review this yourself and place it in
// raser-backend/lib/database-stack.ts, replacing the current placeholder, once you've
// done the things in section 6 of cs509-friday-database-review.md — most importantly,
// PR #27/#29 need to have merged (or you need to coordinate branching off them), since
// this file imports constants from ./config that don't exist on `main` yet as of
// 2026-10-21.
//
// Confirmed by Krishna (2026-10-21): BURSTABLE4_GRAVITON/MICRO (db.t4g.micro) is the
// right instance class — cheapest free-tier-eligible option, matches the bastion's
// choice in NetworkStack. BUT he confirmed this without the actual slide deck open
// (issue #12 references Heineman's slides, Canvas file 8914502). The TODO below to
// visually check the slide before deploying is NOT resolved by this confirmation —
// don't delete that comment until someone's actually looked at the slide.

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import {
  SHARED_VPC_NAME,
  SHARED_LAMBDA_SG_NAME, // add these two to lib/config.ts if asuyer's PR #29 hasn't already
  SHARED_BASTION_SG_NAME,
  SHARED_DB_SECRET_NAME,
  SHARED_DB_ENDPOINT_SSM_PARAM,
  SHARED_DB_NAME,
  DB_PORT,
} from "./config";

export class DatabaseStack extends cdk.Stack {
  public readonly instance: rds.DatabaseInstance;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Find the shared VPC and the two security groups that need DB access, by name
    // rather than by importing NetworkStack directly — keeps DatabaseStack and
    // NetworkStack independently deployable, per the pattern asuyer established in
    // config.ts ("stage stacks never import the shared stacks directly; they find them
    // through these names").
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

    // The database's own security group (the line docs/virtual-private-cloud.md calls
    // out as "to be created in DatabaseStack"). Nothing initiates connections *from* the
    // database, so it only needs ingress rules.
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

    // Auto-generated master credentials, stored in Secrets Manager (never hardcoded).
    // Pinned to a known secret name (rather than the default auto-generated one) so
    // ApiStack's Lambdas (issues #13-#15) can find it the same way everything else in
    // this file finds its shared resources: by a name in config.ts, not a direct import.
    const credentials = rds.Credentials.fromGeneratedSecret("raser_admin", {
      secretName: SHARED_DB_SECRET_NAME,
    });

    this.instance = new rds.DatabaseInstance(this, "Postgres", {
      instanceIdentifier: "raser-shared-db",
      engine: rds.DatabaseInstanceEngine.postgres({
        // TODO(confirm): pin to whatever Postgres version Heineman's slides / the
        // current RDS console default specify. VER_16_4 is a reasonable recent default,
        // not a researched choice — nobody has checked this against the slide deck yet.
        version: rds.PostgresEngineVersion.VER_16_4,
      }),
      // CONFIRMED with Krishna (2026-10-21): cheapest free-tier-eligible burstable
      // class, matching the bastion's choice in NetworkStack.
      //
      // TODO — STILL OUTSTANDING, confirmation above does NOT close this out: issue #12
      // says to use "the cheapest server option that Heineman recommends in his slides"
      // (Canvas file 8914502). Krishna confirmed this choice from memory/instinct, not
      // by looking at the slide. Before opening the PR, someone needs to actually open
      // Canvas file 8914502 and visually check the exact instance class/version named
      // there against BURSTABLE4_GRAVITON/MICRO below. Don't remove this TODO until
      // that's done.
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE4_GRAVITON,
        ec2.InstanceSize.MICRO,
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      credentials,
      // Named explicitly (issues #13-#15) so there's a real database for the papers/
      // issues tables to live in — Postgres' own default ("postgres") works but isn't
      // worth relying on implicitly.
      databaseName: SHARED_DB_NAME,
      multiAz: false, // single-AZ: Multi-AZ doubles the cost for a student project
      allocatedStorage: 20, // GB; smallest size RDS allows, within the free tier
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      publiclyAccessible: false, // only reachable from inside the VPC (Lambda/bastion)
      port: DB_PORT,
      backupRetention: cdk.Duration.days(1), // minimal backups; raise before real prod use
      // TODO: decide per-stage before this is actually used for grading/production —
      // true for production, false elsewhere. One shared DatabaseStack (per issue #20's
      // "6 databases on one instance" plan) means this setting is currently global.
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // TODO: same call — DESTROY is wrong for production
    });

    new cdk.CfnOutput(this, "DbEndpoint", {
      value: this.instance.dbInstanceEndpointAddress,
    });
    new cdk.CfnOutput(this, "DbSecretArn", {
      value: this.instance.secret?.secretArn ?? "none",
    });

    // Published for issues #13-#15: a Lambda inside the VPC's isolated subnets has no
    // path to the SSM API at runtime (no NAT, no SSM interface endpoint — see
    // docs/virtual-private-cloud.md), so it can't call ssm:GetParameter itself either.
    // Reading this through `ssm.StringParameter.valueForStringParameter` from ApiStack
    // instead makes CloudFormation resolve it at *deploy* time via the
    // `AWS::SSM::Parameter::Value<String>` parameter type, so the Lambda just gets a
    // plain env var — no runtime AWS API call needed on either side.
    new ssm.StringParameter(this, "DbEndpointParam", {
      parameterName: SHARED_DB_ENDPOINT_SSM_PARAM,
      stringValue: this.instance.dbInstanceEndpointAddress,
    });
  }
}
