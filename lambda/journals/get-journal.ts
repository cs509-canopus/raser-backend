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
  const { result: validatedPath, errors: pathErrors } = validate(pathSchema, pathParams);

  // Return 400 early on input error
  if (pathErrors) {
    return buildResponse(400, {
      error: "Input error",
      pathErrors,
    });
  }

  // Get the selected journal
  const result = await getJournal({ journalID: validatedPath.journalID });

  // Construct response object
  if ("error" in result) {
    return buildResponse(400, { error: result.error });
  }

  return buildResponse(200, result);
};

export interface GetJournalArgs {
  journalID: string;
}

export interface GetJournalResult {
  journalID: string;
  name: string;
  description?: string;
  websiteUrl?: string;
  coverImage?: string;
  createdAt: Date;
  issues: string[];
}

export interface GetJournalError {
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

export async function getJournal(
  args: GetJournalArgs,
): Promise<GetJournalResult | GetJournalError> {
  try {
    // Select entry from the journal table
    // TODO: add check that owner_id matches the logged in user. If not, return 403 Forbidden
    const journalResult = await query<JournalsSchema>(
      `SELECT id, owner_id, name, description, website_url, cover_image, created_at
       FROM journals
       WHERE id = $1::uuid`,
      [args.journalID],
    );

    // Return error if the chosen journal does not exist
    if (journalResult.rowCount == 0) {
      return {
        error: `Could not get journal with ID ${args.journalID}`,
      };
    }

    // Select all linked issues
    const issuesResult = await query(
      `SELECT id FROM issues
       WHERE journal_id = $1::uuid`,
      [args.journalID],
    );

    // Construct response object
    const journalRow = journalResult.rows[0];
    return {
      journalID: journalRow.id,
      name: journalRow.name,
      description: journalRow.description || undefined,
      websiteUrl: journalRow.website_url || undefined,
      coverImage: journalRow.cover_image || undefined,
      createdAt: journalRow.created_at,
      issues: issuesResult.rows,
    };
  } catch (err) {
    console.error("getJournal failed", err);
    return { error: `Failed to get journal: ${err}` };
  }
}
