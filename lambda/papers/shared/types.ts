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

export interface AddPaperResponse {
  journalID: string;
  issueID: string;
  paperID: string;
  title: string;
  authors: string[];
  publicationDate: string | null;
  paperUrl: string | null;
}

export interface ViewPaperResponse {
  journalID: string;
  issueID: string;
  paperID: string;
  reviews: string[];
}

export interface WithdrawPaperResponse {
  paperID: string;
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
  return { statusCode, body: { error: message } };
}
