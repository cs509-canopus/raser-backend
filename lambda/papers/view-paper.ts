// GET /papers/{paperID} — issue #14 ("View paper").
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query as realQuery } from "./shared/db";
import { getPaperById } from "./shared/papers-repo";
import {
  toApiPaper,
  errorResult,
  type CoreResult,
  type QueryFn,
} from "./shared/types";

export async function viewPaperCore(
  paperId: string | undefined,
  query: QueryFn,
): Promise<CoreResult> {
  if (!paperId) {
    return errorResult(400, "paperID is required in the path");
  }

  const row = await getPaperById(query, paperId);
  if (!row) {
    return errorResult(404, `Paper ${paperId} not found`);
  }

  return { statusCode: 200, body: toApiPaper(row) };
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const result = await viewPaperCore(event.pathParameters?.paperID, realQuery);
  return { statusCode: result.statusCode, body: JSON.stringify(result.body) };
};
