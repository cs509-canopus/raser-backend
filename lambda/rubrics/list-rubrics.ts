import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query } from "../db";
import { getUserID } from "../auth";
import { buildResponse } from "../response-builder";
import { validate } from "../validation";
import * as z from "zod";

const querySchema = z
  .object({
    publishedAfter: z.coerce.date().optional(),
    publishedBefore: z.coerce.date().optional(),
    deprecated: z.stringbool().optional(),
  })
  .refine(
    (data) => {
      if (
        data.publishedAfter === undefined ||
        data.publishedBefore === undefined
      ) {
        return true;
      }

      // publishedBefore > publishedAfter
      const before = new Date(data.publishedBefore);
      const after = new Date(data.publishedAfter);
      return before > after;
    },
    {
      path: ["publishedAfter"],
      error: "publishedAfter must come before publishedBefore",
    },
  );

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const queryParams = event.queryStringParameters || {};
  const { result: validatedQuery, errors: queryErrors } = validate(
    querySchema,
    queryParams,
  );

  // Return 400 early on input error
  if (queryErrors) {
    return buildResponse(400, {
      error: "Input error",
      queryErrors,
    });
  }

  // Build filter object if any filters were provided
  const filters =
    Object.keys(validatedQuery).length > 0 ? { ...validatedQuery } : undefined;

  // Get ID of logged-in user
  const userID = getUserID(event);
  if (!userID) {
    return buildResponse(401, { error: "Unauthorized" });
  }

  // Get all rubrics
  const result = await listRubrics({
    userID,
    filters: {
      ...filters,
    },
  });

  if ("error" in result) {
    return buildResponse(500, { error: result.error });
  }
  return buildResponse(200, result);
};

export interface ListRubricsArgs {
  userID: string;
  filters?: {
    publishedAfter?: Date;
    publishedBefore?: Date;
    deprecated?: boolean;
  };
}

export interface ListRubricsResult {
  deprecated?: boolean;
  publishedAfter?: Date;
  publishedBefore?: Date;
  rubrics: {
    id: string;
    title: string;
    highQualityThreshold: number;
    lowQualityThreshold: number;
    questionCount: number;
  }[];
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
  question_count: number;
}

export async function listRubrics(
  args: ListRubricsArgs,
): Promise<ListRubricsResult | ListRubricsError> {
  const publishedAfter = args.filters?.publishedAfter || null;
  const publishedBefore = args.filters?.publishedBefore || null;
  const deprecated =
    args.filters?.deprecated === undefined ? null : args.filters?.deprecated;

  try {
    const rubricResult = await query<RubricsSchema>(
      `SELECT
         r.id,
         r.title,
         r.high_score_threshold,
         r.low_score_threshold,
         COUNT(rq.rubric_id)::int AS question_count
       FROM rubrics r
       LEFT JOIN rubric_questions rq
         ON rq.rubric_id = r.id
       WHERE (r.designer_id = $1 OR r.publication_date IS NOT NULL)
         AND ($2::timestamp IS NULL OR r.publication_date > $2)
         AND ($3::timestamp IS NULL OR r.publication_date < $3)
         AND ($4::boolean IS NULL OR (r.replaced_by_id IS NOT NULL) = $4)
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
      [args.userID, publishedAfter, publishedBefore, deprecated],
    );

    return {
      // Only include the filters that were provided
      ...(publishedAfter !== null && { publishedAfter }),
      ...(publishedBefore !== null && { publishedBefore }),
      ...(deprecated !== null && { deprecated }),
      rubrics: rubricResult.rows.map((row) => ({
        id: row.id,
        title: row.title,
        highQualityThreshold: row.high_score_threshold,
        lowQualityThreshold: row.low_score_threshold,
        questionCount: row.question_count,
      })),
    };
  } catch (err) {
    console.error("listRubrics failed", err);
    return { error: "Failed to list rubrics" };
  }
}
