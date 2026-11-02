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

// mockable query fn for tests
export type QueryFn = (
  sql: string,
  params?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;

// core result before it becomes an APIGatewayProxyResult, keeps tests off aws-lambda types
export interface CoreResult {
  statusCode: number;
  body: unknown;
}

export function errorResult(statusCode: number, message: string): CoreResult {
  return { statusCode, body: { error: message } };
}
