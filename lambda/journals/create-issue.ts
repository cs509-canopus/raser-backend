import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query } from "../db";
import { DatabaseError } from "pg";

const resultParams: Partial<APIGatewayProxyResult> = {
  isBase64Encoded: false,
  headers: {
    "Access-Control-Allow-Origin": "*",
  },
  multiValueHeaders: {},
};

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const bodyArgs = JSON.parse(event.body ?? "{}");
  const pathParams = event.pathParameters ?? {};

  // Makes sure body has "volumeNumber" and "issueNumber" parameters
  let error = "";
  if (
    !Object.hasOwn(bodyArgs, "volumeNumber") &&
    !Object.hasOwn(bodyArgs, "issueNumber")
  ) {
    error = "Missing body parameters: volumeNumber and issueNumber";
  } else if (!Object.hasOwn(bodyArgs, "volumeNumber")) {
    error = "Missing body parameter: volumeNumber";
  } else if (!Object.hasOwn(bodyArgs, "issueNumber")) {
    error = "Missing body parameter: issueNumber";
  }

  // Make sure path has "journalID"
  if (!Object.hasOwn(pathParams, "journalID")) {
    error = "Missing path parameter: journalID";
  }

  // Make sure the body parameters are integers
  let volumeNumber = bodyArgs.volumeNumber;
  let issueNumber = bodyArgs.issueNumber;
  if (!Number.isInteger(volumeNumber) && !Number.isInteger(issueNumber)) {
    error = "volumeNumber and issueNumber must be integers";
  } else if (!Number.isInteger(volumeNumber)) {
    error = "volumeNumber must be an integer";
  } else if (!Number.isInteger(issueNumber)) {
    error = "issueNumber must be an integer";
  }

  // Return 400 early if there is an error
  if (error != "") {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: error }),
      ...resultParams,
    };
  }

  // Create the issue
  let journalID = pathParams.journalID!;
  const result = await createIssue({ journalID, volumeNumber, issueNumber });

  // Construct response object
  let status;
  let body;
  if ("error" in result) {
    status = 400;
    body = JSON.stringify(result);
  } else {
    status = 201;
    body = JSON.stringify(result);
  }

  return {
    statusCode: status,
    body,
    ...resultParams,
  };
};

export interface CreateIssueArgs {
  journalID: string;
  volumeNumber: number;
  issueNumber: number;
}

export interface CreateIssueResult {
  issueID: string;
  volumeNumber: number;
  issueNumber: number;
  createdAt: Date;
  papers: string[];
}

export interface CreateIssueError {
  error: string;
}

interface IssuesSchema {
  id: string;
  journal_id: string;
  volume_number: number;
  issue_number: number;
  created_at: Date;
}

export async function createIssue(
  args: CreateIssueArgs,
): Promise<CreateIssueResult | CreateIssueError> {
  try {
    // Create issue entry and return the created row
    // TODO: add check that journal.owner_id matches the logged in user. If not, return 403 Forbidden
    const createIssueResult = await query<IssuesSchema>(
      `INSERT INTO issues (journal_id, volume_number, issue_number)
       VALUES ($1::uuid, $2::integer, $3::integer)
       RETURNING *`,
      [args.journalID, args.volumeNumber, args.issueNumber],
    );

    // Return error if issue was not created
    if (createIssueResult.rowCount == 0) {
      return {
        error: "Could not create issue",
      };
    }

    // Construct response object
    const issueRow = createIssueResult.rows[0];
    return {
      issueID: issueRow.id,
      volumeNumber: issueRow.volume_number,
      issueNumber: issueRow.issue_number,
      createdAt: issueRow.created_at,
      papers: [], // always zero issues on creation
    };
  } catch (err) {
    if (err instanceof DatabaseError && err.code === "23505") {
      // unique_violation
      console.error("Duplicate key error", err);
      return {
        error: `Issue volume ${args.volumeNumber} issue ${args.issueNumber} already exists under journal ${args.journalID}`,
      };
    } else if (err instanceof DatabaseError && err.code === "23503") {
      // foreign_key_violation
      console.error("Foreign key violation error", err);
      return {
        error: `Journal with ID ${args.journalID} does not exist`,
      };
    } else {
      console.error("createIssue failed", err);
      return { error: "Failed to create issue" };
    }
  }
}
