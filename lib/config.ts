// Names shared by the stage-less stacks (Network/Database) and every cdk.Stage.
// Stage stacks never import the shared stacks directly; they find them through these names.

/** Name tag on the shared VPC. Stage stacks find it with Vpc.fromLookup({ vpcName }). */
export const SHARED_VPC_NAME = "raser-shared-vpc";

/** Port that the postgres database runs on */
export const DB_PORT = 5432;

/** Port for SSH connections */
export const SSH_PORT = 22;

