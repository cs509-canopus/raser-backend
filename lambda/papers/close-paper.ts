// POST /papers/{paperID}/close (#23)
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query as realQuery } from "../db";
import { closePaper, getPaperById, hasIncompleteReview } from "./shared/papers-repo";
import {
  errorResult,
  type CoreResult,
  type QueryFn,
} from "./shared/types";

const resultParams: Partial<APIGatewayProxyResult> = {
  isBase64Encoded: false,
  headers: {
    "Access-Control-Allow-Origin": "*",
  },
  multiValueHeaders: {},
};

// TODO: no auth yet, should be restricted to whoever can edit the issue
export async function closePaperCore(
  paperId: string | undefined,
  query: QueryFn,
): Promise<CoreResult> {
  if (!paperId) {
    return errorResult(400, "Invalid paperID");
  }

  try {
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
    realQuery,
  );
  return {
    statusCode: result.statusCode,
    body: JSON.stringify(result.body),
    ...resultParams,
  };
};
