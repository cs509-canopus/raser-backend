import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query } from "../db";
import { buildResponse } from "../response-builder";

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  // Extract path params
  const pathParams = event.pathParameters ?? {};

  // Make sure issueID is present in path parameter
  let error = "";
  if (!Object.hasOwn(pathParams, "issueID")) {
    error = "Missing path parameter: issueID";
  }

  // Return 400 early if there is an error
  if (error != "") {
    return buildResponse(400, { error: error });
  }

  // Get the selected issue
  const result = await getIssue({ issueID: pathParams.issueID! });

  // Construct response object
  const status = "error" in result ? 400 : 200;
  return buildResponse(status, result);
};

export interface GetIssueArgs {
  issueID: string;
}

export interface GetIssueResult {
  journalID: string;
  issueID: string;
  volumeNumber: number;
  issueNumber: number;
  createdAt: Date;
  papers: string[];
}

export interface GetIssueError {
  error: string;
}

interface IssuesSchema {
  id: string;
  journal_id: string;
  volume_number: number;
  issue_number: number;
  created_at: Date;
}

export async function getIssue(
  args: GetIssueArgs,
): Promise<GetIssueResult | GetIssueError> {
  try {
    // Select entry from the issue table
    // TODO: add check that journal.owner_id matches the logged in user. If not, return 403 Forbidden
    const issueResult = await query<IssuesSchema>(
      `SELECT id, journal_id, volume_number, issue_number, created_at
       FROM issues
       WHERE id = $1::uuid`,
      [args.issueID],
    );

    // Return error if the chosen issue does not exist
    if (issueResult.rowCount == 0) {
      return {
        error: `Could not get issue with ID ${args.issueID}`,
      };
    }

    // Select all linked papers
    const papersResult = await query(
      `SELECT id FROM papers
       WHERE issue_id = $1::uuid
       AND is_closed = false`,
      [args.issueID],
    );

    // Construct response object
    const issueRow = issueResult.rows[0];
    return {
      journalID: issueRow.journal_id,
      issueID: issueRow.id,
      volumeNumber: issueRow.volume_number,
      issueNumber: issueRow.issue_number,
      createdAt: issueRow.created_at,
      papers: papersResult.rows,
    };
  } catch (err) {
    console.error("getIssue failed", err);
    return { error: `Failed to get issue: ${err}` };
  }
}
