import { addPaperCore } from "../../lambda/papers/add-paper";
import type { QueryFn } from "../../lambda/papers/shared/types";

const ISSUE_ID = "11111111-1111-1111-1111-111111111111";
const JOURNAL_ID = "33333333-3333-3333-3333-333333333333";
const USER_ID = "55555555-5555-5555-5555-555555555555";
const PAPER_ROW = {
  id: "22222222-2222-2222-2222-222222222222",
  issue_id: ISSUE_ID,
  title: "A Great Paper",
  is_closed: false,
  authors: ["Ada Lovelace"],
  publication_date: null,
  paper_url: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

// the issue is only found when it's looked up for its owner (USER_ID)
function fakeQuery(opts: { issueFound: boolean }): QueryFn {
  return async (sql: string, params?: unknown[]) => {
    if (sql.includes("FROM issues")) {
      const found = opts.issueFound && params?.includes(USER_ID);
      return { rows: found ? [{ journal_id: JOURNAL_ID }] : [] };
    }
    if (sql.includes("INSERT INTO papers")) {
      return { rows: [PAPER_ROW] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  };
}

describe("addPaperCore", () => {
  it("returns 400 when issueID is missing", async () => {
    const result = await addPaperCore(
      undefined,
      JSON.stringify({ title: "x" }),
      USER_ID,
      fakeQuery({ issueFound: true }),
    );
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when the body is missing", async () => {
    const result = await addPaperCore(
      ISSUE_ID,
      null,
      USER_ID,
      fakeQuery({ issueFound: true }),
    );
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when the body isn't valid JSON", async () => {
    const result = await addPaperCore(
      ISSUE_ID,
      "{not json",
      USER_ID,
      fakeQuery({ issueFound: true }),
    );
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when title is missing", async () => {
    const result = await addPaperCore(
      ISSUE_ID,
      JSON.stringify({ authors: ["A"] }),
      USER_ID,
      fakeQuery({ issueFound: true }),
    );
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when authors is present but not an array of strings", async () => {
    const result = await addPaperCore(
      ISSUE_ID,
      JSON.stringify({ title: "x", authors: ["A", 2] }),
      USER_ID,
      fakeQuery({ issueFound: true }),
    );
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when paperUrl isn't http(s)", async () => {
    const result = await addPaperCore(
      ISSUE_ID,
      JSON.stringify({ title: "x", paperUrl: "not-a-url" }),
      USER_ID,
      fakeQuery({ issueFound: true }),
    );
    expect(result.statusCode).toBe(400);
  });

  it("returns 404 when the issue doesn't exist", async () => {
    const result = await addPaperCore(
      ISSUE_ID,
      JSON.stringify({ title: "A Great Paper" }),
      USER_ID,
      fakeQuery({ issueFound: false }),
    );
    expect(result.statusCode).toBe(404);
  });

  it("returns 401 when there is no logged-in user", async () => {
    const result = await addPaperCore(
      ISSUE_ID,
      JSON.stringify({ title: "A Great Paper" }),
      undefined,
      fakeQuery({ issueFound: true }),
    );
    expect(result.statusCode).toBe(401);
  });

  it("returns 404 when the issue's journal belongs to someone else", async () => {
    const result = await addPaperCore(
      ISSUE_ID,
      JSON.stringify({ title: "A Great Paper" }),
      "66666666-6666-6666-6666-666666666666",
      fakeQuery({ issueFound: true }),
    );
    expect(result.statusCode).toBe(404);
  });

  it("returns 201 with the created paper on a valid request", async () => {
    const result = await addPaperCore(
      ISSUE_ID,
      JSON.stringify({ title: "A Great Paper", authors: ["Ada Lovelace"] }),
      USER_ID,
      fakeQuery({ issueFound: true }),
    );
    expect(result.statusCode).toBe(201);
    expect(result.body).toMatchObject({
      journalID: JOURNAL_ID,
      issueID: ISSUE_ID,
      paperID: PAPER_ROW.id,
      title: "A Great Paper",
      authors: ["Ada Lovelace"],
    });
  });

  it("defaults authors to an empty array when omitted", async () => {
    const result = await addPaperCore(
      ISSUE_ID,
      JSON.stringify({ title: "A Great Paper" }),
      USER_ID,
      fakeQuery({ issueFound: true }),
    );
    expect(result.statusCode).toBe(201);
  });
});
