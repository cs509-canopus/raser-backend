import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query } from "../db";
import { getUserID } from "../auth";
import { buildResponse } from "../response-builder";
import { validate } from "../validation";
import * as z from "zod";

const pathSchema = z.object({
  issueID: z.uuid(),
});

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  // Extract path params
  const pathParams = event.pathParameters ?? {};
  const { result: validatedPath, errors: pathErrors } = validate(
    pathSchema,
    pathParams,
  );

  // Return 400 early on input error
  if (pathErrors) {
    return buildResponse(400, {
      error: "Input error",
      pathErrors,
    });
  }

  // Get ID of logged-in user
  const userID = getUserID(event);
  if (!userID) {
    return buildResponse(401, { error: "Unauthorized" });
  }

  // Get the selected issue
  const result = await getIssue({ userID, issueID: validatedPath.issueID });

  // Construct response object
  const status = "error" in result ? 400 : 200;
  return buildResponse(status, result);
};

export interface GetIssueArgs {
  userID: string;
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
    // Select entry from the issue table if its journal is owned by the user
    const issueResult = await query<IssuesSchema>(
      `SELECT issues.id, issues.journal_id, issues.volume_number,
              issues.issue_number, issues.created_at
       FROM issues
       JOIN journals ON journals.id = issues.journal_id
       WHERE issues.id = $1::uuid
         AND journals.owner_id = $2`,
      [args.issueID, args.userID],
    );

    // Return error if the chosen issue does not exist under this user
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
