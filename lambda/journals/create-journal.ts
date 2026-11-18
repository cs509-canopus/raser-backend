// POST /journals - issue #13
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query } from "../db";
import { buildResponse } from "../response-builder";
import { validate } from "../validation";
import * as z from "zod";

const bodySchema = z.object({
  name: z.string().nonempty(),
  description: z.string().optional(),
  websiteUrl: z.url().optional(),
  coverImageUrl: z.url().optional(),
});

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
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

  // return 400 early on input error
  if (bodyErrors) {
    return buildResponse(400, {
      error: "Input error",
      bodyErrors,
    });
  }

  // Create the journal
  let name = validatedBody.name;
  let description = validatedBody.description;
  let websiteUrl = validatedBody.websiteUrl;
  let coverImageUrl = validatedBody.coverImageUrl;
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
