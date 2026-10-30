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
  // Extract query params
  const queryParams = event.queryStringParameters || {};
  let query = queryParams.query;

  // Get all journals
  const result = await listJournals({ query });

  // Construct response object
  let status;
  let body;
  if (result.error !== undefined) {
    // Database error
    status = 500;
    body = JSON.stringify({ error: result.error });
  } else {
    status = 200;
    body = JSON.stringify({ journals: result.journals });
  }

  return {
    statusCode: status,
    body: body,
    ...resultParams,
  };
};

export interface ListJournalsArgs {
  query?: string;
}

export interface JournalInfo {
  id: string;
  name: string;
  description: string;
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
      `SELECT id, name, description FROM journals
       WHERE $1::text IS NULL
          OR name ILIKE '%' || $1 || '%'
          OR description ILIKE '%' || $1 || '%'
       ORDER BY name`,
      [q || null],
    );
    return { journals: result.rows };
  } catch (err) {
    console.error("listJournals failed", err);
    return { error: "Failed to list journals" };
  }
}
