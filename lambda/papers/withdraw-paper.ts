// POST /papers/{paperID}/withdraw — issue #23
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query as realQuery } from "../db";
import { closePaper, getPaperById, hasIncompleteReview } from "./shared/papers-repo";
import {
  errorResult,
  type CoreResult,
  type QueryFn,
} from "./shared/types";

// TODO: no auth yet, should be restricted to whoever can edit the issue
export async function withdrawPaperCore(
  paperId: string | undefined,
  query: QueryFn,
): Promise<CoreResult> {
  if (!paperId) {
    return errorResult(400, "Invalid paperID");
  }

  const existing = await getPaperById(query, paperId);
  if (!existing) {
    return errorResult(400, "Invalid paperID");
  }

  if (await hasIncompleteReview(query, paperId)) {
    return errorResult(400, "Paper is currently under review");
  }

  if (!existing.is_closed) {
    await closePaper(query, paperId);
  }

  return { statusCode: 200, body: { paperID: paperId } };
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const result = await withdrawPaperCore(
    event.pathParameters?.paperID,
    realQuery,
  );
  return { statusCode: result.statusCode, body: JSON.stringify(result.body) };
};
