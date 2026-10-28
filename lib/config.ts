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

export const SHARED_DB_SECRET_NAME = "raser-shared-db-secret";
export const SHARED_DB_ENDPOINT_SSM_PARAM = "/raser/shared-db/endpoint";
export const SHARED_DB_NAME = "raser";
