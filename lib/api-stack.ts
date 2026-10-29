import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { DatabaseInstance, IDatabaseInstance } from "aws-cdk-lib/aws-rds";

import { Construct } from "constructs";
import path from "path";
import { SHARED_LAMBDA_SG_NAME, SHARED_VPC_NAME } from "./config";

export class ApiStack extends cdk.Stack {
  private readonly db: IDatabaseInstance;
  private readonly dbEnvironment;
  private readonly vpc: ec2.IVpc;
  private readonly lambdaSg: ec2.ISecurityGroup;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Get the name of this stage
    const stageName = cdk.Stage.of(this)?.stageName ?? "default";

    // Get VPC instance
    this.vpc = ec2.Vpc.fromLookup(this, "Vpc", { vpcName: SHARED_VPC_NAME });
    this.lambdaSg = ec2.SecurityGroup.fromLookupByName(
      this,
      "LambdaSg",
      SHARED_LAMBDA_SG_NAME,
      this.vpc,
    );

    // Get database instance for the stage that this is a part of
    this.db = DatabaseInstance.fromLookup(this, "Database", {
      instanceIdentifier: "raser-shared-db",
    });
    this.dbEnvironment = {
      DB_HOST: this.db.dbInstanceEndpointAddress,
      DB_PORT: this.db.dbInstanceEndpointPort,
      DB_NAME: stageName, // use the db associated with the current stage
      DB_USER: "raser_lambda",
      NODE_EXTRA_CA_CERTS: "/var/runtime/ca-cert.pem",
    };

    // Declare tutorial-api API gateway
    const api = new apigateway.RestApi(this, "RaserApi", {
      restApiName: `${stageName.toLowerCase()}-RaserApi`,

      // Enable CORS for all methods and all origins on all resources in the API
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },

      // Make URLs end in /api/ instead of /prod/
      deployOptions: { stageName: "api" },
    });

    const echoFunction = new NodejsFunction(this, "Echo", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "..", "lambda", "echo.ts"),
    });

    // /echo/{quantity}
    const echoResource = api.root.addResource("echo").addResource("{quantity}");
    echoResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(echoFunction),
    );

    const listJournalsFunction = this.createLambda({
      id: "ListJournals",
      entry: path.join(
        __dirname,
        "..",
        "lambda",
        "journals",
        "list-journals.ts",
      ),
      dbAccess: true,
    });

    // /journals
    const journalsResource = api.root.addResource("journals");
    journalsResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(listJournalsFunction),
    );

    const getJournalFunction = this.createLambda({
      id: "GetJournal",
      entry: path.join(
        __dirname,
        "..",
        "lambda",
        "journals",
        "get-journal.ts",
      ),
      dbAccess: true,
    });

    // /journals/{journalID}
    const journalsJournalIDResource = journalsResource.addResource("{journalID}");
    journalsJournalIDResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getJournalFunction)
    );

    // Get the name of this stage and print a creation message. This is printed whenever
    // this stage is deployed
    new cdk.CfnOutput(this, "CreationMessage", {
      value: `Created ApiStack for stage '${stageName}'`,
    });
  }

  private createLambda({
    id,
    entry,
    dbAccess = false,
  }: {
    id: string;
    entry: string;
    dbAccess?: boolean;
  }): NodejsFunction {
    // Include database props if the lambda needs access to the database
    const dbProps = dbAccess
      ? {
          environment: this.dbEnvironment,
          vpc: this.vpc,
          vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
          securityGroups: [this.lambdaSg],
        }
      : {};

    const fn = new NodejsFunction(this, id, {
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(15),
      entry,
      ...dbProps,
    });

    // Grant this function permission to connect to the database
    if (dbAccess) {
      this.db.grantConnect(fn, this.dbEnvironment.DB_USER);
    }

    return fn;
  }
}
