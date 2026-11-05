import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query } from "../db";
import { buildResponse } from "../response-builder";

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  // Extract query params
  const queryParams = event.queryStringParameters || {};
  let query = queryParams.query;

  // Get all journals
  const result = await listJournals({ query });

  // Construct response object
  if (result.error !== undefined) {
    // Database error
    return buildResponse(500, { error: result.error });
  }
  return buildResponse(200, { journals: result.journals });
};

export interface ListJournalsArgs {
  query?: string;
}

export interface JournalInfo {
  id: string;
  name: string;
  description: string;
  issueCount: number;
}

export interface ListJournalsResult {
  journals?: JournalInfo[];
  error?: string;
}

/**
 * Returns a list all journals
 * @prop query - String to match journals against
 * @returns list of `journals`, or `error` on database error
 */
export async function listJournals(
  args: ListJournalsArgs,
): Promise<ListJournalsResult> {
  const q = args.query?.trim();
  try {
    // TODO: add WHERE owner_id = {id of the logged-in user}
    const result = await query<JournalInfo>(
      `SELECT 
        journals.id, 
        journals.name, 
        journals.description, 
        COUNT(issues.id) as issueCount
       FROM journals
       LEFT JOIN issues ON issues.journal_id = journals.id
       WHERE $1::text IS NULL
          OR name ILIKE '%' || $1 || '%'
          OR description ILIKE '%' || $1 || '%'
       GROUP BY journals.id 
       ORDER BY name;`,
      [q || null],
    );

    return { journals: result.rows };
  } catch (err) {
    console.error("listJournals failed", err);
    return { error: "Failed to list journals" };
  }
}
