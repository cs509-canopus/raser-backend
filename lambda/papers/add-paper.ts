// POST /issues/{issueID}/papers (#21)
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query as realQuery } from "../db";
import { getUserID } from "../auth";
import { insertPaper, journalIdForIssue } from "./shared/papers-repo";
import {
  errorResult,
  type CoreResult,
  type QueryFn,
} from "./shared/types";
import { parseJsonBody, validateAddPaperBody } from "./shared/validation";
import { buildResponse } from "../response-builder";

export async function addPaperCore(
  issueId: string | undefined,
  rawBody: string | null,
  userId: string | undefined,
  query: QueryFn,
): Promise<CoreResult> {
  if (!userId) {
    return errorResult(401, "Unauthorized");
  }

  if (!issueId) {
    return errorResult(400, "issueID is required in the path");
  }

  const parsedBody = parseJsonBody(rawBody);
  if (!parsedBody.ok) {
    return errorResult(400, parsedBody.error);
  }

  const validated = validateAddPaperBody(parsedBody.value);
  if (!validated.ok) {
    return errorResult(400, validated.error);
  }

  try {
    // only the owner of the issue's journal can add papers to it
    const journalId = await journalIdForIssue(query, issueId, userId);
    if (!journalId) {
      return errorResult(404, `Issue ${issueId} not found`);
    }

    const row = await insertPaper(query, issueId, validated.value);
    return {
      statusCode: 201,
      body: {
        journalID: journalId,
        issueID: row.issue_id,
        paperID: row.id,
        title: row.title,
        authors: row.authors,
        publicationDate: row.publication_date,
        paperUrl: row.paper_url,
      },
    };
  } catch (err) {
    console.error("addPaperCore failed", err);
    return errorResult(500, `Failed to add paper: ${err}`);
  }
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const result = await addPaperCore(
    event.pathParameters?.issueID,
    event.body,
    getUserID(event),
    realQuery,
  );
  return buildResponse(result.statusCode, result.body);
};
