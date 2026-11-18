// POST /papers/{paperID}/close (#23)
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query as realQuery } from "../db";
import { getUserID } from "../auth";
import { closePaper, getPaperById, hasIncompleteReview } from "./shared/papers-repo";
import {
  errorResult,
  type CoreResult,
  type QueryFn,
} from "./shared/types";
import { buildResponse } from "../response-builder";

export async function closePaperCore(
  paperId: string | undefined,
  userId: string | undefined,
  query: QueryFn,
): Promise<CoreResult> {
  if (!userId) {
    return errorResult(401, "Unauthorized");
  }

  if (!paperId) {
    return errorResult(400, "Invalid paperID");
  }

  try {
    // only the owner of the paper's journal can close it
    const existing = await getPaperById(query, paperId, userId);
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
  } catch (err) {
    console.error("withdrawPaperCore failed", err);
    return errorResult(500, `Failed to withdraw paper: ${err}`);
  }
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const result = await closePaperCore(
    event.pathParameters?.paperID,
    getUserID(event),
    realQuery,
  );
  return buildResponse(result.statusCode, result.body);
};
