import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query } from "../db";

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
  // Extract path params
  const pathParams = event.pathParameters || {};

  // Make sure issueID is present in path parameter
  let error = "";
  if (!Object.hasOwn(pathParams, "issueID")) {
    error = "Missing path parameter: issueID";
  }

  // Return 400 early if there is an error
  if (error != "") {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: error }),
      ...resultParams,
    };
  }

  // Delete the selected issue
  const result = await deleteIssue({ issueID: pathParams.issueID! });

  // Construct response object
  let status = "error" in result ? 400 : 200;
  const body = JSON.stringify(result);
  return {
    statusCode: status,
    body,
    ...resultParams,
  };
};

export interface DeleteIssueArgs {
  issueID: string;
}

export interface DeleteIssueResult {
  issueID: string;
}

export interface DeleteIssueError {
  error: string;
}

interface IssuesSchema {
  id: string;
  journal_id: string;
  volume_number: number;
  issue_number: number;
  created_at: Date;
}

export async function deleteIssue(
  args: DeleteIssueArgs,
): Promise<DeleteIssueResult | DeleteIssueError> {
  try {
    // Check if the issue exists
    const findIssueResult = await query(
      `SELECT 1 FROM issues WHERE id = $1::uuid`,
      [args.issueID],
    );

    // Return error if the chosen issue does not exist
    if (findIssueResult.rowCount === 0) {
      return {
        error: `No issue with ID ${args.issueID}`,
      };
    }

    // Delete the issue as long as it doesn't have any papers
    const deleteResult = await query<IssuesSchema>(
      `DELETE FROM issues 
       WHERE id = $1::uuid
       AND NOT EXISTS (
         SELECT 1 FROM papers 
         WHERE papers.issue_id = $1::uuid)
       RETURNING *`,
      [args.issueID],
    );

    // Return error if the chosen issue has papers
    if (deleteResult.rowCount === 0) {
      return {
        error: `Cannot delete issue with ID ${args.issueID} because it has papers`,
      };
    }

    // Construct response object
    return {
      issueID: deleteResult.rows[0].id,
    };
  } catch (err) {
    console.error("deleteIssue failed", err);
    return { error: `Failed to delete issue: ${err}` };
  }
}
