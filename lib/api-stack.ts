import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import * as path from "path";
import {
  SHARED_VPC_NAME,
  SHARED_LAMBDA_SG_NAME,
  SHARED_DB_SECRET_NAME,
  SHARED_DB_ENDPOINT_SSM_PARAM,
  SHARED_DB_NAME,
  DB_PORT,
} from "./config";

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

    // -------------------------------------------------------------------------------
    // Paper endpoints (issues #13-#15) — the first real routes on this API. Nothing
    // here existed before; this establishes the pattern (VPC-bound NodejsFunction per
    // route, resources found by name per config.ts, env vars resolved at CFN-deploy
    // time rather than called at Lambda-runtime) for whoever builds the next endpoint.
    // -------------------------------------------------------------------------------

    // Same "find the shared stuff by name" pattern DatabaseStack/NetworkStack use —
    // keeps ApiStack independently deployable without importing those stacks directly.
    const vpc = ec2.Vpc.fromLookup(this, "Vpc", { vpcName: SHARED_VPC_NAME });
    const lambdaSg = ec2.SecurityGroup.fromLookupByName(
      this,
      "LambdaSg",
      SHARED_LAMBDA_SG_NAME,
      vpc,
    );

    // The DB secret and endpoint, resolved by CloudFormation at deploy time (not an
    // AWS API call the Lambda itself makes — see lib/config.ts and
    // lib/database-stack.ts for why the isolated VPC subnets rule that out).
    const dbSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      "DbSecret",
      SHARED_DB_SECRET_NAME,
    );
    const dbHost = ssm.StringParameter.valueForStringParameter(
      this,
      SHARED_DB_ENDPOINT_SSM_PARAM,
    );

    const dbEnvironment = {
      DB_HOST: dbHost,
      DB_PORT: String(DB_PORT),
      DB_NAME: SHARED_DB_NAME,
      // `unsafeUnwrap()` is the CDK-sanctioned escape hatch for exactly this case: it
      // doesn't put the plaintext secret in this TypeScript/the synthesized template as
      // a literal — it emits a `{{resolve:secretsmanager:...}}` dynamic reference,
      // which CloudFormation resolves only when it actually creates/updates the Lambda.
      // Trade-off (flagging for the team, same as the TLS note in lambda/papers/shared
      // /db.ts): the resolved value is then visible in the Lambda's environment
      // variables in the console to anyone who can read the function config. Accepted
      // here because the alternative — a Secrets Manager VPC interface endpoint, so the
      // Lambda could fetch it itself at runtime — costs ~$7-10/mo and nobody's
      // provisioned one; revisit if that changes.
      DB_USER: dbSecret.secretValueFromJson("username").unsafeUnwrap(),
      DB_PASSWORD: dbSecret.secretValueFromJson("password").unsafeUnwrap(),
    };

    const lambdaProps: Partial<nodejs.NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [lambdaSg],
      environment: dbEnvironment,
      timeout: cdk.Duration.seconds(10),
      bundling: { minify: true, sourceMap: true },
    };

    const addPaperFn = new nodejs.NodejsFunction(this, "AddPaperFn", {
      entry: path.join(__dirname, "..", "lambda", "papers", "add-paper.ts"),
      ...lambdaProps,
    });

    const viewPaperFn = new nodejs.NodejsFunction(this, "ViewPaperFn", {
      entry: path.join(__dirname, "..", "lambda", "papers", "view-paper.ts"),
      ...lambdaProps,
    });

    const withdrawPaperFn = new nodejs.NodejsFunction(this, "WithdrawPaperFn", {
      entry: path.join(
        __dirname,
        "..",
        "lambda",
        "papers",
        "withdraw-paper.ts",
      ),
      ...lambdaProps,
    });

    // /issues/{issueID}/papers
    const issues = api.root.addResource("issues");
    const issue = issues.addResource("{issueID}");
    const issuePapers = issue.addResource("papers");
    issuePapers.addMethod("POST", new apigateway.LambdaIntegration(addPaperFn));

    // /papers/{paperID}
    const papers = api.root.addResource("papers");
    const paper = papers.addResource("{paperID}");
    paper.addMethod("GET", new apigateway.LambdaIntegration(viewPaperFn));

    // /papers/{paperID}/withdraw
    const paperWithdraw = paper.addResource("withdraw");
    paperWithdraw.addMethod(
      "POST",
      new apigateway.LambdaIntegration(withdrawPaperFn),
    );
  }
}
