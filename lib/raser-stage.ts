import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { ApiStack } from "./api-stack";

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

export class RaserStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Add stacks here that should be cloned for every stage
    new ApiStack(this, "ApiStack", { env });
  }
}
