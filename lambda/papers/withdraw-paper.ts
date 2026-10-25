// POST /papers/{paperID}/withdraw — issue #15 ("Withdraw paper").
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query as realQuery } from "./shared/db";
import { closePaper, getPaperById } from "./shared/papers-repo";
import {
  toApiPaper,
  errorResult,
  type CoreResult,
  type QueryFn,
} from "./shared/types";

/**
 * Core logic. Two design decisions worth Krishna's/the team's sign-off:
 *
 * 1. "Withdraw" = soft delete. Sets papers.is_closed = true rather than deleting the
 *    row, per the ERD's own design note (db/schema.sql) that `is_closed`/`closed` is the
 *    column that exists for exactly this. Reviews, the paper's history, etc. all stay
 *    intact and queryable — nothing about a withdrawn paper disappears.
 * 2. Idempotent, not an error, on a paper that's already withdrawn: withdrawing twice
 *    just returns the paper's current (already-closed) state with 200, rather than a
 *    409 Conflict. Picked this because "withdraw a paper that's already withdrawn"
 *    isn't really a client error — the end state the caller wants already holds. Happy
 *    to switch to a 409 if the team wants withdrawal treated as a one-time transition.
 *
 * Also no auth check here either, same flag as add-paper.ts — confirm who's allowed to
 * withdraw a paper (presumably whoever could add it, maybe also the paper's own
 * author?) once there's an auth system to check against.
 */
export async function withdrawPaperCore(
  paperId: string | undefined,
  query: QueryFn,
): Promise<CoreResult> {
  if (!paperId) {
    return errorResult(400, "paperID is required in the path");
  }

  const existing = await getPaperById(query, paperId);
  if (!existing) {
    return errorResult(404, `Paper ${paperId} not found`);
  }

  const row = existing.is_closed
    ? existing
    : ((await closePaper(query, paperId)) ?? existing);
  return { statusCode: 200, body: toApiPaper(row) };
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
