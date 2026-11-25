import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { ApiStack } from "../lib/api-stack";
import { AuthenticationStack } from "../lib/authentication-stack";

let template: Template;
let methods: Record<string, any>;

beforeAll(() => {
  // Skip esbuild bundling of every lambda, the tests only look at the template
  const app = new cdk.App({ context: { "aws:cdk:bundling-stacks": [] } });

  // Lookups (VPC, security group, database) need an account and region. Without cached
  // context they return dummy values, which is fine here.
  const env = { account: "123456789012", region: "us-east-1" };
  const authenticationStack = new AuthenticationStack(
    app,
    "AuthenticationStack",
    { env },
  );
  const apiStack = new ApiStack(app, "ApiStack", {
    env,
    userPool: authenticationStack.userPool,
  });

  template = Template.fromStack(apiStack);
  methods = template.findResources("AWS::ApiGateway::Method");
});

test("creates one Cognito user pool authorizer", () => {
  template.resourceCountIs("AWS::ApiGateway::Authorizer", 1);
  template.hasResourceProperties("AWS::ApiGateway::Authorizer", {
    Type: "COGNITO_USER_POOLS",
    IdentitySource: "method.request.header.Authorization",
    ProviderARNs: [Match.anyValue()],
  });
});

test("every endpoint except /echo requires a logged-in user", () => {
  const [authorizerID] = Object.keys(
    template.findResources("AWS::ApiGateway::Authorizer"),
  );

  for (const [logicalID, method] of Object.entries(methods)) {
    const props = method.Properties;

    // CORS preflights and the echo test endpoint stay public
    if (props.HttpMethod === "OPTIONS" || logicalID.includes("echo")) {
      expect(props.AuthorizationType).toBe("NONE");
      continue;
    }

    expect(props.AuthorizationType).toBe("COGNITO_USER_POOLS");
    expect(props.AuthorizerId).toEqual({ Ref: authorizerID });
  }
});

test("POST /journals requires a logged-in user", () => {
  const createJournal = Object.entries(methods).find(
    ([logicalID, method]) =>
      logicalID.startsWith("RaserApijournalsPOST") &&
      method.Properties.HttpMethod === "POST",
  );
  expect(createJournal).toBeDefined();
  expect(createJournal![1].Properties.AuthorizationType).toBe(
    "COGNITO_USER_POOLS",
  );
});

test("POST /echo/{quantity} is public", () => {
  const echo = Object.entries(methods).find(
    ([logicalID, method]) =>
      logicalID.includes("echo") && method.Properties.HttpMethod === "POST",
  );
  expect(echo).toBeDefined();
  expect(echo![1].Properties.AuthorizationType).toBe("NONE");
  expect(echo![1].Properties.AuthorizerId).toBeUndefined();
});

test("API gateway errors (like a 401 from the authorizer) include the CORS header", () => {
  for (const type of ["DEFAULT_4XX", "DEFAULT_5XX"]) {
    template.hasResourceProperties("AWS::ApiGateway::GatewayResponse", {
      ResponseType: type,
      ResponseParameters: {
        "gatewayresponse.header.Access-Control-Allow-Origin": "'*'",
      },
    });
  }
});
