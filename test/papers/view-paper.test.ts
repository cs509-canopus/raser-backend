import { viewPaperCore } from "../../lambda/papers/view-paper";
import type { QueryFn } from "../../lambda/papers/shared/types";

const PAPER_ID = "22222222-2222-2222-2222-222222222222";
const PAPER_ROW = {
  id: PAPER_ID,
  issue_id: "11111111-1111-1111-1111-111111111111",
  title: "A Great Paper",
  is_closed: false,
  authors: ["Ada Lovelace"],
  publication_date: "2026-03-01",
  paper_url: "https://example.com/paper.pdf",
  created_at: "2026-01-01T00:00:00.000Z",
};

function fakeQuery(opts: { found: boolean }): QueryFn {
  return async () => ({ rows: opts.found ? [PAPER_ROW] : [] });
}

describe("viewPaperCore", () => {
  it("returns 400 when paperID is missing", async () => {
    const result = await viewPaperCore(undefined, fakeQuery({ found: true }));
    expect(result.statusCode).toBe(400);
  });

  it("returns 404 when the paper doesn't exist", async () => {
    const result = await viewPaperCore(PAPER_ID, fakeQuery({ found: false }));
    expect(result.statusCode).toBe(404);
  });

  it("returns 200 with the paper, mapped to the API shape", async () => {
    const result = await viewPaperCore(PAPER_ID, fakeQuery({ found: true }));
    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({
      id: PAPER_ID,
      issueId: "11111111-1111-1111-1111-111111111111",
      title: "A Great Paper",
      closed: false,
      authors: ["Ada Lovelace"],
      publicationDate: "2026-03-01",
      paperUrl: "https://example.com/paper.pdf",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });
});
