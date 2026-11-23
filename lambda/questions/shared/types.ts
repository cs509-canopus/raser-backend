export interface RubricQuestionRow {
  rubric_id: string;
  section: number;
  index: number;
  question: string | null;
  score_explanations: string | null;
}

export interface AddQuestionResponse {
  rubricID: string;
  section: number;
  index: number;
  question: string;
  scoreExplanations: string[];
}

export interface ViewQuestionResponse {
  rubricID: string;
  section: number;
  index: number;
  question: string;
  scoreExplanations: string[];
}

export interface DeleteQuestionResponse {
  rubricID: string;
  section: number;
  index: number;
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