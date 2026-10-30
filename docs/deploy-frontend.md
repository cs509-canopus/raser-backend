# Deploying the Frontend to the S3 bucket

The [frontend site](https://github.com/cs509-canopus/raser-frontend) is compiled into
static HTML pages and uploaded to an S3 bucket on AWS, where it is then served by a
CloudFront distribution. The S3 bucket and CloudFront distribution constructs are
created in `SiteStack` (`lib/site-stack.ts`). The frontend files have to be built and
uploaded to the S3 bucket whenever they change.

## Deploying SiteStack on your stage

You can deploy `SiteStack` on your own stage with the following command:

```sh
cdk deploy "<your-username>/SiteStack"    # replace <your-username> with your stage name
```

This creates an S3 bucket named `raser-cs509-canopus-<your-username>`, which you can
view on the 
[AWS dashboard](https://us-east-1.console.aws.amazon.com/s3/buckets?region=us-east-1),
and a CloudFront distribution, which has an ID and public URL. The output of 
`cdk deploy` above returns the URL. **Be sure to copy this down**:

```
Outputs:
CloudFrontWebsiteUrl = https://<some-id>.cloudfront.net
DistributionId = <distribution-id>
```

## Building and uploading frontend files 

**Navigate to the frontend repo, then follow these steps**.

Before starting, make sure to set the `NEXT_PUBLIC_API_URL` environment variable to your
API Gateway URL. The easiest way to do this is to create a `.env.local` file:

```
NEXT_PUBLIC_API_URL="https://<some-id>.execute-api.us-east-1.amazonaws.com/api/"
```

**Use the URL corresponding to your stage.** This is the URL that the frontend will send
API requests to using the axios `backend` instance (see `src/axios-client.ts`).

Next, build the site:

```sh
npm run build
```

Static website files are written to `out/`. Upload those files to your S3 bucket with the
following. Replace `<your-username>` with your stage name.

```sh
aws s3 sync out/ s3://raser-cs509-canopus-<your-username>/ --delete
```

Finally, tell CloudFront to drop its cached copies of its site files. This makes it so
that CloudFront doesn't try to serve an old/outdated version of a page.

```sh
aws cloudfront create-invalidation --distribution-id <distribution-id> --paths "/*"
```

