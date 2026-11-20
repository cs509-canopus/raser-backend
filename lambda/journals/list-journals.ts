import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query } from "../db";
import { getUserID } from "../auth";
import { buildResponse } from "../response-builder";

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  // Extract query params
  const queryParams = event.queryStringParameters || {};
  let query = queryParams.query;

  // Get ID of logged-in user
  const userID = getUserID(event);
  if (!userID) {
    return buildResponse(401, { error: "Unauthorized" });
  }

  // Get all journals owned by the logged-in user
  const result = await listJournals({ userID, query });

  // Construct response object
  const status = "error" in result ? 500 : 200;
  return buildResponse(status, result);
};

export interface ListJournalsArgs {
  userID: string;
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
 * Returns a list of all journals owned by the user
 * @prop userID - ID of the logged-in user
 * @prop query - String to match journals against
 * @returns list of `journals`, or `error` on database error
 */
export async function listJournals(
  args: ListJournalsArgs,
): Promise<ListJournalsResult> {
  const q = args.query?.trim();
  try {
    const result = await query<JournalInfo>(
      `SELECT 
        journals.id, 
        journals.name, 
        journals.description, 
        COUNT(issues.id) as issueCount
       FROM journals
       LEFT JOIN issues ON issues.journal_id = journals.id
       WHERE journals.owner_id = $2
         AND (
           $1::text IS NULL
           OR name ILIKE '%' || $1 || '%'
           OR description ILIKE '%' || $1 || '%'
         )
       GROUP BY journals.id 
       ORDER BY name;`,
      [q || null, args.userID],
    );

    return { journals: result.rows };
  } catch (err) {
    console.error("listJournals failed", err);
    return { error: "Failed to list journals" };
  }
}
