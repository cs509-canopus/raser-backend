import { viewPaperCore } from "../../lambda/papers/view-paper";
import type { QueryFn } from "../../lambda/papers/shared/types";

const PAPER_ID = "22222222-2222-2222-2222-222222222222";
const ISSUE_ID = "11111111-1111-1111-1111-111111111111";
const JOURNAL_ID = "33333333-3333-3333-3333-333333333333";
const REVIEW_IDS = ["44444444-4444-4444-4444-444444444444"];

function fakeQuery(opts: { found: boolean }): QueryFn {
  return async (sql: string) => {
    if (sql.includes("FROM papers p")) {
      return {
        rows: opts.found
          ? [{ journal_id: JOURNAL_ID, issue_id: ISSUE_ID }]
          : [],
      };
    }
    if (sql.includes("FROM reviews")) {
      return { rows: REVIEW_IDS.map((id) => ({ id })) };
    }
    throw new Error(`Unexpected query: ${sql}`);
  };
}

describe("viewPaperCore", () => {
  it("returns 400 when paperID is missing", async () => {
    const result = await viewPaperCore(undefined, fakeQuery({ found: true }));
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when the paper doesn't exist", async () => {
    const result = await viewPaperCore(PAPER_ID, fakeQuery({ found: false }));
    expect(result.statusCode).toBe(400);
  });

  it("returns 200 with the paper's journal, issue and reviews", async () => {
    const result = await viewPaperCore(PAPER_ID, fakeQuery({ found: true }));
    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({
      journalID: JOURNAL_ID,
      issueID: ISSUE_ID,
      paperID: PAPER_ID,
      reviews: REVIEW_IDS,
    });
  });
});
