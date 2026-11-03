import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export class SiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Get the name of this stage
    const stageName = cdk.Stage.of(this)?.stageName ?? "default";

    // Private bucket to store frontend files.
    const bucket = new s3.Bucket(this, "FrontendBucket", {
      bucketName: `raser-cs509-canopus-${stageName}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Rewrite page URLs to the index.html files emitted by Next's static export
    // (trailingSlash: true), e.g. /journals/ and /journals -> /journals/index.html
    const rewriteFunction = new cloudfront.Function(
      this,
      "RewriteIndexFunction",
      {
        runtime: cloudfront.FunctionRuntime.JS_2_0,
        code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri.endsWith("/")) {
    request.uri += "index.html";
  } else if (!uri.split("/").pop().includes(".")) {
    // No file extension, so treat it as a directory
    request.uri += "/index.html";
  }

  return request;
}
`),
      },
    );

    // Cloudfront distribution to server the website files
    const distribution = new cloudfront.Distribution(this, "Distribution", {
      // Page served when someone requests "/"
      defaultRootObject: "index.html",

      defaultBehavior: {
        // Creates the OAC and adds the bucket policy for you
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [
          {
            function: rewriteFunction,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },

      // S3 returns 403 (not 404) for missing objects because the OAC can't list the bucket
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 404,
        responsePagePath: "/404.html",
        ttl: cdk.Duration.minutes(1),
      })),

      // Serve from US/Canada/Europe edges only (cheaper if we ever exceed the free tier)
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    // Print CloudFront website URL
    new cdk.CfnOutput(this, "CloudFrontWebsiteUrl", {
      value: `https://${distribution.distributionDomainName}`,
    });
    new cdk.CfnOutput(this, "DistributionId", {
      value: distribution.distributionId,
    });
  }
}
