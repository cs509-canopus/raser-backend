import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query } from "../db";
import { DatabaseError } from "pg";
import { buildResponse } from "../response-builder";
import { validate } from "../validation";
import * as z from "zod";

const bodySchema = z
  .object({
    name: z.string().trim().nonempty(),
    highQualityThreshold: z.int().nonnegative(),
    lowQualityThreshold: z.int().nonnegative(),
  })
  .refine((data) => data.highQualityThreshold > data.lowQualityThreshold, {
    path: ["highQualityThreshold"],
    error: "highQualityThreshold must be greater than lowQualityThreshold",
  });

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  // Extract and validate body
  let bodyArgs;
  try {
    bodyArgs = JSON.parse(event.body ?? "{}");
  } catch {
    return buildResponse(400, {
      error: "Invalid JSON body",
    });
  }
  const { result: validatedBody, errors: bodyErrors } = validate(
    bodySchema,
    bodyArgs,
  );

  // Return 400 early on input error
  if (bodyErrors) {
    return buildResponse(400, {
      error: "Input error",
      bodyErrors,
    });
  }

  // Create rubric (Test user)
  const result = await createRubric({
    title: validatedBody.name,
    designer: "ffffffff-ffff-ffff-ffff-ffffffffffff",
    highQualityThreshold: validatedBody.highQualityThreshold,
    lowQualityThreshold: validatedBody.lowQualityThreshold,
  });

  // Construct response object
  const status = "error" in result ? 400 : 201;
  return buildResponse(status, result);
};

export interface CreateRubricArgs {
  title: string;
  designer: string;
  highQualityThreshold: number;
  lowQualityThreshold: number;
}

export interface CreateRubricResult {
  rubricID: string;
  designerID: string;
  title: string;
  questions: string[];
  highQualityThreshold: number;
  lowQualityThreshold: number;
  score: number;
  publicationDate?: Date;
  deprecationDate: null;
}

export interface CreateRubricError {
  error: string;
}

interface RubricsSchema {
  id: string;
  designer: string;
  title: string;
  high_score_threshold: number;
  low_score_threshold: number;
  publication_date?: Date;
}

export async function createRubric(
  args: CreateRubricArgs,
): Promise<CreateRubricResult | CreateRubricError> {
  try {
    // Create rubric entry and return the created row
    const createRubricResult = await query<RubricsSchema>(
      `INSERT INTO rubrics (
         title,
         designer_id,
         high_score_threshold,
         low_score_threshold
       )
       VALUES ($1, $2, $3::integer, $4::integer)
       RETURNING *`,
      [
        args.title,
        args.designer,
        args.highQualityThreshold,
        args.lowQualityThreshold,
      ],
    );

    // Return error if rubric was not created
    if (createRubricResult.rowCount === 0) {
      return {
        error: "Could not create rubric",
      };
    }

    // Construct response object
    const rubricRow = createRubricResult.rows[0];

    return {
      rubricID: rubricRow.id,
      designerID: rubricRow.designer,
      title: rubricRow.title,
      questions: [],
      highQualityThreshold: rubricRow.high_score_threshold,
      lowQualityThreshold: rubricRow.low_score_threshold,
      score: 0,
      publicationDate: rubricRow.publication_date,
      deprecationDate: null,
    };
  } catch (err) {
    if (err instanceof DatabaseError && err.code === "23505") {
      // unique_violation
      console.error("Duplicate key error", err);
      return {
        error: `Rubric with name ${args.title} already exists`,
      };
    } else {
      console.error("createRubric failed", err);
      return {
        error: `Failed to create rubric: ${err}`,
      };
    }
  }
}
