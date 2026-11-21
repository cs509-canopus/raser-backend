import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { AuthenticationStack } from "../lib/authentication-stack";

let template: Template;

beforeAll(() => {
  const app = new cdk.App();
  const stack = new AuthenticationStack(app, "AuthenticationStack", {});
  template = Template.fromStack(stack);
});

test("creates exactly one Cognito user pool", () => {
  template.resourceCountIs("AWS::Cognito::UserPool", 1);
});

test("the user pool allows self sign-up with email", () => {
  template.hasResourceProperties("AWS::Cognito::UserPool", {
    AdminCreateUserConfig: { AllowAdminCreateUserOnly: false },
  });
});

test("creates exactly one app client with no secret", () => {
  template.resourceCountIs("AWS::Cognito::UserPoolClient", 1);
  template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
    GenerateSecret: false,
  });
});
