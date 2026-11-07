import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query } from "../db";
import { buildResponse } from "../response-builder";

// Test user ID
// TODO: replace with signed-in user ID
const userID = "ffffffff-ffff-ffff-ffff-ffffffffffff";

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  // TODO: add filtering using query parameters

  // Get all rubrics
  const result = await listRubrics({ userID });

  if ("error" in result) {
    return buildResponse(500, { error: result.error });
  }
  return buildResponse(200, result);
};

export interface ListRubricsArgs {
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

export interface ListRubricsError {
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

export async function listRubrics(
  args: ListRubricsArgs,
): Promise<RubricListItem[] | ListRubricsError> {
  try {
    const rubricResult = await query<RubricsSchema>(
      `SELECT
         r.id,
         r.designer_id,
         r.title,
         r.high_score_threshold,
         r.low_score_threshold,
         r.publication_date,
         r.is_favorite,
         r.replaced_by_id,
         r.created_at,
         COUNT(rq.rubric_id)::int AS question_count
       FROM rubrics r
       LEFT JOIN rubric_questions rq
         ON rq.rubric_id = r.id
       WHERE r.designer_id = $1::uuid
       GROUP BY
         r.id,
         r.designer_id,
         r.title,
         r.high_score_threshold,
         r.low_score_threshold,
         r.publication_date,
         r.is_favorite,
         r.replaced_by_id,
         r.created_at
       ORDER BY r.created_at DESC`,
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
  } catch (err) {
    console.error("listRubrics failed", err);
    return { error: "Failed to list rubrics" };
  }
}
