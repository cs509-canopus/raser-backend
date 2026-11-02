import { viewPaperCore } from "../../lambda/papers/view-paper";
import type { QueryFn } from "../../lambda/papers/shared/types";

const PAPER_ID = "22222222-2222-2222-2222-222222222222";
const ISSUE_ID = "11111111-1111-1111-1111-111111111111";
const JOURNAL_ID = "33333333-3333-3333-3333-333333333333";
const REVIEW_IDS = ["44444444-4444-4444-4444-444444444444"];
const PAPER_FIELDS = {
  title: "A Great Paper",
  authors: ["Ada Lovelace", "Alan Turing"],
  publication_date: "2026-05-01",
  paper_url: "https://example.com/paper.pdf",
};

function fakeQuery(opts: { found: boolean }): QueryFn {
  return async (sql: string) => {
    if (sql.includes("FROM papers p")) {
      return {
        rows: opts.found
          ? [{ journal_id: JOURNAL_ID, issue_id: ISSUE_ID, ...PAPER_FIELDS }]
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

  it("returns 200 with all of the paper's fields and its reviews", async () => {
    const result = await viewPaperCore(PAPER_ID, fakeQuery({ found: true }));
    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({
      journalID: JOURNAL_ID,
      issueID: ISSUE_ID,
      paperID: PAPER_ID,
      title: PAPER_FIELDS.title,
      authors: PAPER_FIELDS.authors,
      publicationDate: PAPER_FIELDS.publication_date,
      paperUrl: PAPER_FIELDS.paper_url,
      reviews: REVIEW_IDS,
    });
  });

  it("returns an empty reviews array when the paper has no reviews", async () => {
    const query: QueryFn = async (sql: string) => {
      if (sql.includes("FROM papers p")) {
        return {
          rows: [
            {
              journal_id: JOURNAL_ID,
              issue_id: ISSUE_ID,
              title: PAPER_FIELDS.title,
              authors: [],
              publication_date: null,
              paper_url: null,
            },
          ],
        };
      }
      if (sql.includes("FROM reviews")) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    };
    const result = await viewPaperCore(PAPER_ID, query);
    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({
      journalID: JOURNAL_ID,
      issueID: ISSUE_ID,
      paperID: PAPER_ID,
      title: PAPER_FIELDS.title,
      authors: [],
      publicationDate: null,
      paperUrl: null,
      reviews: [],
    });
  });
});
