import { withdrawPaperCore } from "../../lambda/papers/withdraw-paper";
import type { QueryFn } from "../../lambda/papers/shared/types";

const PAPER_ID = "22222222-2222-2222-2222-222222222222";

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

describe("withdrawPaperCore", () => {
  it("returns 400 when paperID is missing", async () => {
    const query: QueryFn = async () => ({ rows: [] });
    const result = await withdrawPaperCore(undefined, query);
    expect(result.statusCode).toBe(400);
  });

  it("returns 404 when the paper doesn't exist", async () => {
    const query: QueryFn = async () => ({ rows: [] });
    const result = await withdrawPaperCore(PAPER_ID, query);
    expect(result.statusCode).toBe(404);
  });

  it("closes an open paper and returns it with closed: true", async () => {
    const calls: string[] = [];
    const query: QueryFn = async (sql) => {
      calls.push(sql);
      if (sql.includes("UPDATE")) {
        return { rows: [openPaperRow({ is_closed: true })] };
      }
      return { rows: [openPaperRow()] };
    };

    const result = await withdrawPaperCore(PAPER_ID, query);

    expect(result.statusCode).toBe(200);
    expect((result.body as { closed: boolean }).closed).toBe(true);
    expect(calls.some((sql) => sql.includes("UPDATE"))).toBe(true);
  });

  it("is idempotent: withdrawing an already-closed paper doesn't run an UPDATE and still returns 200", async () => {
    const calls: string[] = [];
    const query: QueryFn = async (sql) => {
      calls.push(sql);
      return { rows: [openPaperRow({ is_closed: true })] };
    };

    const result = await withdrawPaperCore(PAPER_ID, query);

    expect(result.statusCode).toBe(200);
    expect((result.body as { closed: boolean }).closed).toBe(true);
    expect(calls.some((sql) => sql.includes("UPDATE"))).toBe(false);
  });
});
