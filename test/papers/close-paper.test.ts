import { closePaperCore } from "../../lambda/papers/close-paper";
import type { QueryFn } from "../../lambda/papers/shared/types";

const PAPER_ID = "22222222-2222-2222-2222-222222222222";
const USER_ID = "55555555-5555-5555-5555-555555555555";

function openPaperRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: PAPER_ID,
    issue_id: "11111111-1111-1111-1111-111111111111",
    title: "A Great Paper",
    is_closed: false,
    authors: ["Ada Lovelace"],
    publication_date: null,
    paper_url: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("closePaperCore", () => {
  it("returns 400 when paperID is missing", async () => {
    const query: QueryFn = async () => ({ rows: [] });
    const result = await closePaperCore(undefined, USER_ID, query);
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when the paper doesn't exist", async () => {
    const query: QueryFn = async () => ({ rows: [] });
    const result = await closePaperCore(PAPER_ID, USER_ID, query);
    expect(result.statusCode).toBe(400);
  });

  it("returns 401 when there is no logged-in user", async () => {
    const query: QueryFn = async () => ({ rows: [openPaperRow()] });
    const result = await closePaperCore(PAPER_ID, undefined, query);
    expect(result.statusCode).toBe(401);
  });

  it("looks the paper up for the logged-in user", async () => {
    const lookups: unknown[][] = [];
    const query: QueryFn = async (sql, params) => {
      if (sql.includes("FROM papers")) lookups.push(params ?? []);
      return { rows: [] };
    };

    const result = await closePaperCore(PAPER_ID, USER_ID, query);

    expect(result.statusCode).toBe(400);
    expect(lookups).toEqual([[PAPER_ID, USER_ID]]);
  });

  it("returns 400 when the paper has an incomplete review", async () => {
    const query: QueryFn = async (sql) => {
      if (sql.includes("FROM reviews")) return { rows: [{ "1": 1 }] };
      return { rows: [openPaperRow()] };
    };

    const result = await closePaperCore(PAPER_ID, USER_ID, query);

    expect(result.statusCode).toBe(400);
    expect(result.body).toEqual({ error: "Paper is currently under review" });
  });

  it("closes an open paper and returns its id", async () => {
    const calls: string[] = [];
    const query: QueryFn = async (sql) => {
      calls.push(sql);
      if (sql.includes("FROM reviews")) return { rows: [] };
      if (sql.includes("UPDATE")) return { rows: [openPaperRow({ is_closed: true })] };
      return { rows: [openPaperRow()] };
    };

    const result = await closePaperCore(PAPER_ID, USER_ID, query);

    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({ paperID: PAPER_ID });
    expect(calls.some((sql) => sql.includes("UPDATE"))).toBe(true);
  });

  it("is idempotent: closing an already-closed paper doesn't run an UPDATE", async () => {
    const calls: string[] = [];
    const query: QueryFn = async (sql) => {
      calls.push(sql);
      if (sql.includes("FROM reviews")) return { rows: [] };
      return { rows: [openPaperRow({ is_closed: true })] };
    };

    const result = await closePaperCore(PAPER_ID, USER_ID, query);

    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({ paperID: PAPER_ID });
    expect(calls.some((sql) => sql.includes("UPDATE"))).toBe(false);
  });
});
