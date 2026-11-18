// GET /papers/{paperID} (#22)
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query as realQuery } from "../db";
import { getPaperViewInfo } from "./shared/papers-repo";
import {
  errorResult,
  type CoreResult,
  type QueryFn,
} from "./shared/types";
import { buildResponse } from "../response-builder";

export async function viewPaperCore(
  paperId: string | undefined,
  query: QueryFn,
): Promise<CoreResult> {
  if (!paperId) {
    return errorResult(400, "Invalid paperID");
  }

  try {
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
        title: info.title,
        isClosed: info.isClosed,
        authors: info.authors,
        publicationDate: info.publicationDate,
        paperUrl: info.paperUrl,
        reviews: info.reviewIds,
      },
    };
  } catch (err) {
    console.error("viewPaperCore failed", err);
    return errorResult(500, `Failed to view paper: ${err}`);
  }
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const result = await viewPaperCore(event.pathParameters?.paperID, realQuery);
  return buildResponse(result.statusCode, result.body);
};
