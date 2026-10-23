import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Get the name of this stage and print a creation message. This is printed whenever
    // this stage is deployed
    const stageName = cdk.Stage.of(this)?.stageName ?? "default";
    new cdk.CfnOutput(this, "CreationMessage", {
      value: `Created ApiStack for stage '${stageName}'`,
    });
  }
}
