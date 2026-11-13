import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";

export class AuthenticationStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const stageName = cdk.Stage.of(this)?.stageName;

    this.userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: `${stageName}-raser-users`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY, // by default its phone and email so we are changing it to email only
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.userPoolClient = this.userPool.addClient("WebClient", {
      generateSecret: false,
      authFlows: { userSrp: true, userPassword: true },
    });

    
    new cdk.CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: this.userPoolClient.userPoolClientId,
    });
  }
}
