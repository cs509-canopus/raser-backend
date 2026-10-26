import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { ApiStack } from "./api-stack";

export class RaserStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Add stacks here that should be cloned for every stage
    new ApiStack(this, "ApiStack", {});
  }
}
