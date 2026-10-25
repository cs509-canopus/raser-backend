// Names shared by the stage-less stacks (Network/Database) and every cdk.Stage.
// Stage stacks never import the shared stacks directly; they find them through these names.

/** Name tag on the shared VPC. Stage stacks find it with Vpc.fromLookup({ vpcName }). */
export const SHARED_VPC_NAME = "raser-shared-vpc";

/** Port that the postgres database runs on */
export const DB_PORT = 5432;

/** Port for SSH connections */
export const SSH_PORT = 22;

/** Security group name for Lambdas that need to reach the database. */
export const SHARED_LAMBDA_SG_NAME = "raser-lambda-db-clients";

/** Security group name for the developer bastion that tunnels to the database. */
export const SHARED_BASTION_SG_NAME = "raser-db-bastion";

// ---------------------------------------------------------------------------------
// Added for issues #13-#15 (paper endpoints). The VPC's isolated subnets have no NAT
// gateway and no interface endpoint for Secrets Manager or SSM (see
// docs/virtual-private-cloud.md), so a Lambda running inside them cannot call either
// service's API at runtime. Both of the constants below are instead resolved by
// CloudFormation itself at *deploy* time (dynamic references / the
// `AWS::SSM::Parameter::Value<String>` parameter type), then handed to the Lambda as a
// plain environment variable — no in-Lambda network call needed. See api-stack.ts.
// ---------------------------------------------------------------------------------

/** Secrets Manager secret name holding the shared Postgres admin credentials. */
export const SHARED_DB_SECRET_NAME = "raser-db-credentials";

/** SSM parameter name DatabaseStack publishes the Postgres endpoint hostname under. */
export const SHARED_DB_ENDPOINT_SSM_PARAM = "/raser/shared/db-endpoint";

/** Name of the Postgres database (inside the shared instance) that holds the app's tables. */
export const SHARED_DB_NAME = "raser";
