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

  // Make sure journalID is present in path parameter
  let error = "";
  if (!Object.hasOwn(pathParams, "journalID")) {
    error = "Missing path parameter: journalID";
  }

  // Return 400 early if there is an error
  if (error != "") {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: error }),
      ...resultParams,
    };
  }

  // Withdraw the selected journal
  const result = await withdrawJournal({ journalID: pathParams.journalID! });

  // Construct response object
  let status = "error" in result ? 400 : 200;
  const body = JSON.stringify(result);
  return {
    statusCode: status,
    body,
    ...resultParams,
  };
};

export interface WithdrawJournalArgs {
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
    // Check if the journal exists
    const findJournalResult = await query(
      `SELECT 1 FROM journals WHERE id = $1::uuid`,
      [args.journalID],
    );

    // Return error if the chosen journal does not exist
    if (findJournalResult.rowCount === 0) {
      return {
        error: `No journal with ID ${args.journalID}`,
      };
    }

    // Delete the journal as long as it doesn't have any issues
    const deleteResult = await query<JournalsSchema>(
      `DELETE FROM journals 
       WHERE id = $1::uuid
       AND NOT EXISTS (
         SELECT 1 FROM issues 
         WHERE issues.journal_id = $1::uuid)
       RETURNING *`,
      [args.journalID],
    );

    // Return error if the chosen journal has issues
    if (deleteResult.rowCount === 0) {
      return {
        error: `Cannot delete journal with ID ${args.journalID} because it has issues`,
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
