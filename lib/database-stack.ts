import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export class DatabaseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Get the name of this stage and print a creation message. This is printed whenever
    // this stage is deployed
    new cdk.CfnOutput(this, "CreationMessage", {
      value: `Created DatabaseStack`,
    });
  }
}
