// GET /rubrics/by-designer - issue #84
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query } from "../db";

const resultParams: Partial<APIGatewayProxyResult> = {
  isBase64Encoded: false,
  headers: {
    "Access-Control-Allow-Origin": "*",
  },
  multiValueHeaders: {},
};

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  // Test user ID
  const userID = "ffffffff-ffff-ffff-ffff-ffffffffffff";

  const result = await listUserRubrics({ userID });

  let status;
  let body;

  if ("error" in result) {
    status = 500;
    body = JSON.stringify({ error: result.error });
  } else {
    status = 200;
    body = JSON.stringify(result);
  }

  return {
    statusCode: status,
    body,
    ...resultParams,
  };
};

export interface ListUserRubricsArg {
  userID: string;
}

export interface RubricListItem {
  rubricID: string;
  designerID: string;
  title: string;
  highQualityThreshold: number;
  lowQualityThreshold: number;
  publicationDate: Date | null;
  isFavorite: boolean;
  replacedByID: string | null;
  createdAt: Date;
  questionCount: number;
}

export interface ListUserRubricsError {
  error: string;
}

interface RubricsSchema {
  id: string;
  designer_id: string;
  title: string;
  high_score_threshold: number;
  low_score_threshold: number;
  publication_date: Date | null;
  is_favorite: boolean;
  replaced_by_id: string | null;
  created_at: Date;
  question_count: number;
}

export async function listUserRubrics(
  args: ListUserRubricsArg,
): Promise<RubricListItem[] | ListUserRubricsError> {
  try {
    const rubricResult = await query<RubricsSchema>(
      `
        SELECT r.id, 
               r.title, 
               r.high_score_threshold, 
               r.low_score_threshold, 
               r.publication_date, 
               r.is_favorite, 
               r.replaced_by_id, 
               r.created_at, 
               COUNT(rq.rubric_id)::int AS question_count
        FROM rubrics r
        LEFT JOIN rubrics_questions rq
            ON rq.rubric_id = r.rubric_id
        WHERE r.designer_id = args.userID
        ORDER BY r.create_at DESC`,
      [args.userID],
    );
    return rubricResult.rows.map((row) => ({
      rubricID: row.id,
      designerID: row.designer_id,
      title: row.title,
      highQualityThreshold: row.high_score_threshold,
      lowQualityThreshold: row.low_score_threshold,
      publicationDate: row.publication_date,
      isFavorite: row.is_favorite,
      replacedByID: row.replaced_by_id,
      createdAt: row.created_at,
      questionCount: row.question_count,
    }));
  } catch (e) {
    console.error("listUserRubrics failed", e);
    return { error: "Failed to list user's rubrics" };
  }
}