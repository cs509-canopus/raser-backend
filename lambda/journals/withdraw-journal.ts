import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query } from "../db";
import { buildResponse } from "../response-builder";
import { validate } from "../validation";
import * as z from "zod";

const pathSchema = z.object({
  journalID: z.uuid(),
});

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  // Extract and validate path params
  const pathParams = event.pathParameters || {};
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
  const testID = "ffffffff-ffff-ffff-ffff-ffffffffffff";
  const userID = event.requestContext.authorizer?.claims?.sub ?? testID;

  // Withdraw the selected journal
  const result = await withdrawJournal({
    userID: userID,
    journalID: validatedPath.journalID,
  });

  // Construct response object
  const status = "error" in result ? 400 : 200;
  return buildResponse(status, result);
};

export interface WithdrawJournalArgs {
  userID: string;
  journalID: string;
}

export interface WithdrawJournalResult {
  journalID: string;
}

export interface WithdrawJournalError {
  error: string;
}

interface JournalsSchema {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  website_url: string | null;
  cover_image: string | null;
  created_at: Date;
}

export async function withdrawJournal(
  args: WithdrawJournalArgs,
): Promise<WithdrawJournalResult | WithdrawJournalError> {
  try {
    // Check if the journal exists under this user
    const findJournalResult = await query(
      `SELECT 1 FROM journals 
       WHERE owner_id = $1::uuid AND id = $2::uuid`,
      [args.userID, args.journalID],
    );

    // Return error if the chosen journal does not exist under this user
    if (findJournalResult.rowCount === 0) {
      return {
        error: `Journal not found: ${args.journalID}`,
      };
    }

    // Delete any reviews on any papers in this journal
    await query(
      `DELETE FROM reviews
       WHERE id IN (
         SELECT reviews.id
         FROM reviews
         JOIN papers ON reviews.paper_id = papers.id
         JOIN issues ON papers.issue_id = issues.id
         WHERE issues.journal_id = $1::uuid
       )`,
      [args.journalID],
    );

    // Delete any papers in this journal
    await query(
      `DELETE FROM papers
       WHERE id IN (
         SELECT papers.id
         FROM papers
         JOIN issues ON papers.issue_id = issues.id
         WHERE issues.journal_id = $1::uuid
       )`,
      [args.journalID],
    );

    // Delete any journals in this issue
    await query(
      `DELETE FROM issues
       WHERE journal_id = $1::uuid`,
      [args.journalID],
    );

    // Delete the journal
    const deleteResult = await query<JournalsSchema>(
      `DELETE FROM journals 
       WHERE id = $1::uuid
       RETURNING *`,
      [args.journalID],
    );

    // Return error if the chosen journal has issues
    if (deleteResult.rowCount === 0) {
      return {
        error: `Cannot delete journal with ID ${args.journalID}`,
      };
    }

    // Construct response object
    return {
      journalID: deleteResult.rows[0].id,
    };
  } catch (err) {
    console.error("withdrawJournal failed", err);
    return { error: `Failed to withdraw journal: ${err}` };
  }
}
