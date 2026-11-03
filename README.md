# RASER: Rubrics for Assessing Scientific Experimental Research

## Setting up dependencies

Install the following:
- [aws cli](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-quickstart.html)
- [cdk cli](https://docs.aws.amazon.com/cdk/v2/guide/getting-started.html)
- [sam cli](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)

If using nix, you can install all these dependencies by running:

```sh
nix develop
```

Then, install package dependencies:

```sh
npm install
```

## Repository structure

```
raser-backend/
|-- bin/
|   |-- raser-backend.ts          # defines the AWS application
|-- db/                           # database schema/code
|-- docs/
|   |-- connect-to-database.md    # how to connect to database from your machine 
|   |-- deploy-frontend.md        # how to build frontend and upload it to the S3 bucket
|   |-- lambda-development.md     # lambda function development guide
|   |-- virtual-private-cloud.md  # explanation of VPC architecture
|-- lambda/                       # code for lambda functions
|-- lib/                          # stack and stage definitions
|-- scripts/                      # steps for connecting to db & testing with sam cli
|-- test/                         # unit tests
|-- package.json
|-- ...
```

## AWS Architecture

This AWS application is made up of 6 [stages](https://docs.aws.amazon.com/cdk/v2/guide/stages.html): `production`, `staging`, and 4 developer stages (one for each developer). Each stage has an instance of the following [stacks](https://docs.aws.amazon.com/cdk/v2/guide/stacks.html):
- `ApiStack`: defines API gateway and all lambda functions
- `SiteStack`: defines S3 bucket and CloudFront distribution

Outside of the stages, the application defines the following stacks:
- `NetworkStack`: defines VPC and security groups
- `DatabaseStack`: defines RDS database

These stacks are not put inside the stages for cost reasons, since they declare long running servers (i.e. VPC and RDS) which would cost more to duplicate 6 times. Instead, the RDS postgres database instance defines 6 databases with identical schemas (whose names match the stage names) that lambda functions in each stage automatically target.

Note that running `cdk list` should produce the following output. Notice that stacks that are part of the stage are prefixed with `<stage-name>/`. 

```
DatabaseStack
NetworkStack
production/ApiStack (production-ApiStack)
production/SiteStack (production-SiteStack)
staging/ApiStack (staging-ApiStack)
staging/SiteStack (staging-SiteStack)
asuyer/ApiStack (asuyer-ApiStack)
asuyer/SiteStack (asuyer-SiteStack)
msegui/ApiStack (msegui-ApiStack)
msegui/SiteStack (msegui-SiteStack)
kchang/ApiStack (kchang-ApiStack)
kchang/SiteStack (kchang-SiteStack)
kgarg/ApiStack (kgarg-ApiStack)
kgarg/SiteStack (kgarg-SiteStack)
```

### Deploying
 
If this is your first time using the CDK and you are deploying to a new AWS account, run the following command:

```sh
cdk bootstrap
```

To deploy the shared stacks, use the following commands. **This only needs to be once**. This will take a few minutes:

```sh
cdk deploy NetworkStack
cdk deploy DatabaseStack
```

To deploy all the stacks in a stage, run the following command (replacing `<stage-name>` with the actual stage name). **This should be done whenever you add/remove/change lambda functions and/or API gateway endpoints**:

```sh
cdk deploy '<stage-name>/*'
```

## AI use

> [!NOTE]
> Krishna (kgarg): some of my early commits were written with help from Claude Code, mainly
> the RDS setup in #30 and the paper endpoints in #33 (closed). The "Kairo" notes in those
> diffs came from that.
