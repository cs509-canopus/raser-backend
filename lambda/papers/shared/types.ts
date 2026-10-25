// Shapes shared by the three paper endpoints (issues #13-#15).

/** Row shape as it comes back from Postgres (snake_case, matching db/schema.sql). */
export interface PaperRow {
  id: string;
  issue_id: string;
  title: string;
  is_closed: boolean;
  authors: string[];
  publication_date: string | null;
  paper_url: string | null;
  created_at: string;
}

/** What the API actually returns (camelCase, matching the RASER class diagram's Paper). */
export interface ApiPaper {
  id: string;
  issueId: string;
  title: string;
  closed: boolean;
  authors: string[];
  publicationDate: string | null;
  paperUrl: string | null;
  createdAt: string;
  // NOTE: the class diagram also puts a `reviews` relation on Paper. Left out on purpose —
  // no review endpoints exist yet (that's a different teammate's use case), so there is
  // nothing real to put here. Add it once that exists instead of guessing at a shape now.
}

export function toApiPaper(row: PaperRow): ApiPaper {
  return {
    id: row.id,
    issueId: row.issue_id,
    title: row.title,
    closed: row.is_closed,
    authors: row.authors,
    publicationDate: row.publication_date,
    paperUrl: row.paper_url,
    createdAt: row.created_at,
  };
}

/** Minimal shape of a DB query function — just enough to be mocked in tests without pg. */
export type QueryFn = (
  sql: string,
  params?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;

/** What every handler's core logic function returns, before it gets turned into an
 * APIGatewayProxyResult. Kept separate from the API Gateway types so the core logic can
 * be unit tested with no `aws-lambda` types or event object involved at all. */
export interface CoreResult {
  statusCode: number;
  body: unknown;
}

export function errorResult(statusCode: number, message: string): CoreResult {
  // Error shape is a single `{ error: string }` field. Nobody on the team has settled on
  // a convention yet (CONTRIBUTING.md/docs don't say) — this is the simplest thing that
  // works; flag for the team if/when a second endpoint wants something richer (an error
  // code, field-level validation messages, etc).
  return { statusCode, body: { error: message } };
}
