// POST /journals - issue #13
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query } from "../db";
import { buildResponse } from "../response-builder";

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const bodyArgs = JSON.parse(event.body ?? "{}");

  // make sure body has "name" parameter
  let error = "";
  if (!Object.hasOwn(bodyArgs, "name")) {
    error = "Missing body parameter: name";
  }
  // return 400 early if there is an error
  if (error != "") {
    return buildResponse(400, { error: error });
  }

  // create the journal
  let name = bodyArgs.name;
  let description = bodyArgs.description ?? null;
  let websiteUrl = bodyArgs.websiteUrl ?? null;
  let coverImageUrl = bodyArgs.coverImageUrl ?? null;

  const result = await createJournal({
    name,
    description,
    websiteUrl,
    coverImageUrl,
  });

  // construct response object
  const status = "error" in result ? 400 : 201;
  return buildResponse(status, result);
};

export interface CreateJournalArgs {
  name: string;
  description?: string;
  websiteUrl?: string;
  coverImageUrl?: string;
}

export interface CreateJournalResult {
  journalID: string;
  ownerID: string;
  name: string;
  description: string | null;
  websiteUrl: string | null;
  coverImageUrl: string | null;
}

export interface CreateJournalError {
  error: string;
}

interface JournalSchema {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  website_url: string | null;
  cover_image: string | null;
  created_at: Date;
}

export async function createJournal(
  args: CreateJournalArgs,
): Promise<CreateJournalResult | CreateJournalError> {
  // create journal entry and return the created row
  try {
    // TODO: replace hardcoded owner_id in next iteration with actual user ID from auth context
    const createJournalResult = await query<JournalSchema>(
      `INSERT INTO journals (owner_id, name, description, website_url, cover_image)
             VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid, $1::text, $2, $3, $4) 
             RETURNING *`,
      [args.name, args.description, args.websiteUrl, args.coverImageUrl],
    );

    // return error if journal was not created
    if (createJournalResult.rowCount === 0) {
      return {
        error: "Could not create journal",
      };
    }

    // construct response object
    const journalRow = createJournalResult.rows[0];
    return {
      journalID: journalRow.id,
      ownerID: journalRow.owner_id,
      name: journalRow.name,
      description: journalRow.description,
      websiteUrl: journalRow.website_url,
      coverImageUrl: journalRow.cover_image,
    };
  } catch (e) {
    console.error("createJournal failed", e);
    return {
      error: "Failed to create journal",
    };
  }
}
