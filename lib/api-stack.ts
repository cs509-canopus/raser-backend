import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";

import { Construct } from "constructs";

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

    // Get the name of this stage and print a creation message. This is printed whenever
    // this stage is deployed
    new cdk.CfnOutput(this, "CreationMessage", {
      value: `Created ApiStack for stage '${stageName}'`,
    });
  }
}
