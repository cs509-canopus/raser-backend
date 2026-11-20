import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query } from "../db";
import { DatabaseError } from "pg";
import { getUserID } from "../auth";
import { buildResponse } from "../response-builder";
import { validate } from "../validation";
import * as z from "zod";

const pathSchema = z.object({
  journalID: z.uuid(),
});

const bodySchema = z.object({
  volumeNumber: z.int().positive(),
  issueNumber: z.int().positive(),
});

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  // Extract and validate path params
  const pathParams = event.pathParameters ?? {};
  const { result: validatedPath, errors: pathErrors } = validate(
    pathSchema,
    pathParams,
  );

  // Extract and validate body
  let bodyArgs;
  try {
    bodyArgs = JSON.parse(event.body ?? "{}");
  } catch {
    return buildResponse(400, {
      error: "Invalid JSON body",
    });
  }
  const { result: validatedBody, errors: bodyErrors } = validate(
    bodySchema,
    bodyArgs,
  );

  // Return 400 early on input error
  if (pathErrors || bodyErrors) {
    return buildResponse(400, {
      error: "Input error",
      pathErrors,
      bodyErrors,
    });
  }

  // Get ID of logged-in user
  const userID = getUserID(event);
  if (!userID) {
    return buildResponse(401, { error: "Unauthorized" });
  }

  // Create the issue
  const result = await createIssue({
    userID,
    journalID: validatedPath.journalID,
    volumeNumber: validatedBody.volumeNumber,
    issueNumber: validatedBody.issueNumber,
  });

  // Construct response object
  const status = "error" in result ? 400 : 201;
  return buildResponse(status, result);
};

export interface CreateIssueArgs {
  userID: string;
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
    // Create issue entry (only if the journal is owned by the user) and return the created row
    const createIssueResult = await query<IssuesSchema>(
      `INSERT INTO issues (journal_id, volume_number, issue_number)
       SELECT $1::uuid, $2::integer, $3::integer
       WHERE EXISTS (
         SELECT 1 FROM journals
         WHERE id = $1::uuid AND owner_id = $4
       )
       RETURNING *`,
      [args.journalID, args.volumeNumber, args.issueNumber, args.userID],
    );

    // Return error if the journal does not exist under this user
    if (createIssueResult.rowCount == 0) {
      return {
        error: `Journal with ID ${args.journalID} does not exist`,
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
