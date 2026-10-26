import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

import { Construct } from "constructs";
import path from "path";

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Get the name of this stage
    const stageName = cdk.Stage.of(this)?.stageName ?? "default";

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

    // Get the name of this stage and print a creation message. This is printed whenever
    // this stage is deployed
    new cdk.CfnOutput(this, "CreationMessage", {
      value: `Created ApiStack for stage '${stageName}'`,
    });
  }
}
