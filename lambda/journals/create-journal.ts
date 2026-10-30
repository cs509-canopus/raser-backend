// POST /journals - issue #13
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { query } from '../db';
import { DatabaseError } from 'pg';

const resultParams: Partial<APIGatewayProxyResult> = {
    isBase64Encoded: false,
    headers: {
        'Access-Control-Allow-Origin': '*',
    },
    multiValueHeaders: {},
};

export const handler = async (
    event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
    const bodyArgs = JSON.parse(event.body ?? '{}');

    // make sure body has "name" parameter
    let error = "";
    if (!Object.hasOwn(bodyArgs, 'name')) {
        error = "Missing body parameter: name";
    }
    // return 400 early if there is an error
    if (error != "") {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: error }),
            ...resultParams,
        };
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
        coverImageUrl
    });

    // construct response object
    let status;
    let body;
    if ("error" in result) {
        status = 400;
        body = JSON.stringify(result);
    } else {
        status = 201;
        body = JSON.stringify(result);
    }

    return {
        statusCode: status,
        body,
        ...resultParams,
    };
};

export interface CreateJournalResult {
    ownerID: string;
    name: string;
    description?: string;
    websiteUrl?: string;
    coverImageUrl?: string;
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
    cover_image_url: string | null;
    created_at: Date;
}

export async function createJournal(
    args: CreateJournalArgs,
): Promise<CreateJournalResult | CreateJournalError> {
    // create journal entry and return the created row
    try {
        const createJournalResult = await query<JournalSchema>(
            `INSERT INTO journals (owner_id, name, description, website_url, cover_image_url)
             VALUES ($1::uuid, $2::string, $3, $4, $5) 
             RETURNING *`,
             [args.ownerID, args.name, args.description, args.websiteUrl, args.coverImageUrl],
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
            ownerID: journalRow.owner_id,
            name: journalRow.name,
            description: journalRow.description,
            websiteUrl: journalRow.website_url,
            coverImageUrl: journalRow.cover_image_url,
        };
    } catch (e) {
        console.error("createJournal failed", e);
        return {
            error: "Failed to create journal",
        };
    }
}