// POST /issues/{issueID}/papers — issue #21
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query as realQuery } from "../db";
import { insertPaper, journalIdForIssue } from "./shared/papers-repo";
import {
  errorResult,
  type CoreResult,
  type QueryFn,
} from "./shared/types";
import { parseJsonBody, validateAddPaperBody } from "./shared/validation";

export async function addPaperCore(
  issueId: string | undefined,
  rawBody: string | null,
  query: QueryFn,
): Promise<CoreResult> {
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

  // TODO: no auth yet, should be restricted to the issue's JournalDesigner
  const journalId = await journalIdForIssue(query, issueId);
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
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const result = await addPaperCore(
    event.pathParameters?.issueID,
    event.body,
    realQuery,
  );
  return { statusCode: result.statusCode, body: JSON.stringify(result.body) };
};
