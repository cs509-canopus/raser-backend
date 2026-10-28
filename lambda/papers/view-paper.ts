// GET /papers/{paperID} — issue #22
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query as realQuery } from "./shared/db";
import { getPaperViewInfo } from "./shared/papers-repo";
import {
  errorResult,
  type CoreResult,
  type QueryFn,
} from "./shared/types";

export async function viewPaperCore(
  paperId: string | undefined,
  query: QueryFn,
): Promise<CoreResult> {
  if (!paperId) {
    return errorResult(400, "Invalid paperID");
  }

  const info = await getPaperViewInfo(query, paperId);
  if (!info) {
    return errorResult(400, "Invalid paperID");
  }

  return {
    statusCode: 200,
    body: {
      journalID: info.journalId,
      issueID: info.issueId,
      paperID: paperId,
      reviews: info.reviewIds,
    },
  };
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const result = await viewPaperCore(event.pathParameters?.paperID, realQuery);
  return { statusCode: result.statusCode, body: JSON.stringify(result.body) };
};
