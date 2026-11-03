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

  // Rubric ID from API Gateway (is there a hardcoded rubric we want to make)
  const rubricID = event.pathParameters?.rubricID;

  if (!rubricID) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Missing path parameter: rubricID",
      }),
      ...resultParams,
    };
  }

  const result = await getRubric({ rubricID, userID });

  let status;
  let body;

  if ("error" in result) {
    status = result.error.startsWith("Failed") ? 500 : 404;
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

export interface GetRubricArgs {
  rubricID: string;
  userID: string;
}

export interface RubricQuestion {
  section: number;
  index: number;
  question: string | null;
  scoreExplanations: string | null;
}

export interface GetRubricResult {
  rubricID: string;
  designerID: string;
  title: string;
  questions: RubricQuestion[];
  highQualityThreshold: number;
  lowQualityThreshold: number;
  publicationDate: Date | null;
  isFavorite: boolean;
  replacedByID: string | null;
  createdAt: Date;
}

export interface GetRubricError {
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
}

interface RubricQuestionsSchema {
  section: number;
  index: number;
  question: string | null;
  score_explanations: string | null;
}

export async function getRubric(
  args: GetRubricArgs,
): Promise<GetRubricResult | GetRubricError> {
  try {
    // Select rubric only if it belongs to the authenticated user
    const rubricResult = await query<RubricsSchema>(
      `SELECT
         id,
         designer_id,
         title,
         high_score_threshold,
         low_score_threshold,
         publication_date,
         is_favorite,
         replaced_by_id,
         created_at
       FROM rubrics
       WHERE id = $1::uuid
         AND designer_id = $2::uuid`,
      [args.rubricID, args.userID],
    );

    // Return error if rubric does not exist or does not belong to user
    if (rubricResult.rowCount === 0) {
      return {
        error: `Could not get rubric with ID ${args.rubricID}`,
      };
    }

    // Select all linked questions
    const questionsResult = await query<RubricQuestionsSchema>(
      `SELECT
         section,
         index,
         question,
         score_explanations
       FROM rubric_questions
       WHERE rubric_id = $1::uuid
       ORDER BY section ASC, index ASC`,
      [args.rubricID],
    );

    // Construct response object
    const rubricRow = rubricResult.rows[0];

    return {
      rubricID: rubricRow.id,
      designerID: rubricRow.designer_id,
      title: rubricRow.title,
      questions: questionsResult.rows.map((row) => ({
        section: row.section,
        index: row.index,
        question: row.question,
        scoreExplanations: row.score_explanations,
      })),
      highQualityThreshold: rubricRow.high_score_threshold,
      lowQualityThreshold: rubricRow.low_score_threshold,
      publicationDate: rubricRow.publication_date,
      isFavorite: rubricRow.is_favorite,
      replacedByID: rubricRow.replaced_by_id,
      createdAt: rubricRow.created_at,
    };
  } catch (err) {
    console.error("getRubric failed", err);
    return { error: "Failed to get rubric" };
  }
}

