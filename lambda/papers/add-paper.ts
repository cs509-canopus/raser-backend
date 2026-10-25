// POST /issues/{issueID}/papers — issue #13 ("Add paper").
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query as realQuery } from "./shared/db";
import { insertPaper, issueExists } from "./shared/papers-repo";
import {
  toApiPaper,
  errorResult,
  type CoreResult,
  type QueryFn,
} from "./shared/types";
import { parseJsonBody, validateAddPaperBody } from "./shared/validation";

/**
 * Core logic, with the DB access injected — this is what the unit tests exercise. No
 * `aws-lambda` event/result types and no real pg connection involved.
 */
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

  // DESIGN FLAG for Krishna: no auth exists anywhere in this project yet, so this
  // doesn't check *who* is adding a paper to the issue, only that the issue exists.
  // The RASER actors imply this should be restricted to the issue's JournalDesigner
  // (or similar) once there's a session/auth system to check against — confirm with
  // the team before this ships somewhere that matters.
  if (!(await issueExists(query, issueId))) {
    return errorResult(404, `Issue ${issueId} not found`);
  }

  const row = await insertPaper(query, issueId, validated.value);
  return { statusCode: 201, body: toApiPaper(row) };
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
