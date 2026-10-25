import { addPaperCore } from "../../lambda/papers/add-paper";
import type { QueryFn } from "../../lambda/papers/shared/types";

const ISSUE_ID = "11111111-1111-1111-1111-111111111111";
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

/** Builds a fake query function: SELECT against issues finds/doesn't find the issue,
 * INSERT into papers returns the given row. */
function fakeQuery(opts: { issueFound: boolean }): QueryFn {
  return async (sql: string) => {
    if (sql.includes("FROM issues")) {
      return { rows: opts.issueFound ? [{ "1": 1 }] : [] };
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
      fakeQuery({ issueFound: true }),
    );
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when the body is missing", async () => {
    const result = await addPaperCore(
      ISSUE_ID,
      null,
      fakeQuery({ issueFound: true }),
    );
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when the body isn't valid JSON", async () => {
    const result = await addPaperCore(
      ISSUE_ID,
      "{not json",
      fakeQuery({ issueFound: true }),
    );
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when title is missing", async () => {
    const result = await addPaperCore(
      ISSUE_ID,
      JSON.stringify({ authors: ["A"] }),
      fakeQuery({ issueFound: true }),
    );
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when authors is present but not an array of strings", async () => {
    const result = await addPaperCore(
      ISSUE_ID,
      JSON.stringify({ title: "x", authors: ["A", 2] }),
      fakeQuery({ issueFound: true }),
    );
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when paperUrl isn't http(s)", async () => {
    const result = await addPaperCore(
      ISSUE_ID,
      JSON.stringify({ title: "x", paperUrl: "not-a-url" }),
      fakeQuery({ issueFound: true }),
    );
    expect(result.statusCode).toBe(400);
  });

  it("returns 404 when the issue doesn't exist", async () => {
    const result = await addPaperCore(
      ISSUE_ID,
      JSON.stringify({ title: "A Great Paper" }),
      fakeQuery({ issueFound: false }),
    );
    expect(result.statusCode).toBe(404);
  });

  it("returns 201 with the created paper on a valid request", async () => {
    const result = await addPaperCore(
      ISSUE_ID,
      JSON.stringify({ title: "A Great Paper", authors: ["Ada Lovelace"] }),
      fakeQuery({ issueFound: true }),
    );
    expect(result.statusCode).toBe(201);
    expect(result.body).toMatchObject({
      id: PAPER_ROW.id,
      issueId: ISSUE_ID,
      title: "A Great Paper",
      closed: false,
      authors: ["Ada Lovelace"],
    });
  });

  it("defaults authors to an empty array when omitted", async () => {
    const result = await addPaperCore(
      ISSUE_ID,
      JSON.stringify({ title: "A Great Paper" }),
      fakeQuery({ issueFound: true }),
    );
    expect(result.statusCode).toBe(201);
  });
});
