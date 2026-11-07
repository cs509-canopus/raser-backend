import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query } from "../db";
import { buildResponse } from "../response-builder";
import { validate } from "../validation";
import * as z from "zod";

const pathSchema = z.object({
  rubricID: z.uuid(),
});

const bodySchema = z
  .object({
    name: z.string().trim().nonempty().optional(),
    highQualityThreshold: z.int().nonnegative().optional(),
    lowQualityThreshold: z.int().nonnegative().optional(),
  })
  .refine(
    (data) => {
      // Make sure at least one of the values is provided
      return Object.values(data).some((val) => val !== undefined);
    },
    {
      path: [],
      error: "At least one field must be provided",
    },
  )
  .refine(
    (data) => {
      // If one of the fields is undefined, no check
      if (
        data.highQualityThreshold === undefined ||
        data.lowQualityThreshold === undefined
      ) {
        return true;
      }

      // Both are present: ensure highQualityThreshold > lowQualityThreshold
      return data.highQualityThreshold > data.lowQualityThreshold;
    },
    {
      path: ["highQualityThreshold"],
      error: "highQualityThreshold must be greater than lowQualityThreshold",
    },
  );

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  // Extract and validate path params
  const pathParams = event.pathParameters || {};
  const { result: validatedPath, errors: pathErrors } = validate(
    pathSchema,
    pathParams,
  );

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
  if (pathErrors || bodyErrors) {
    return buildResponse(400, {
      error: "Input error",
      pathErrors,
      bodyErrors,
    });
  }

  // Edit the selected rubric
  const result = await editRubric({
    id: validatedPath.rubricID,
    title: validatedBody.name,
    lowQualityThreshold: validatedBody.lowQualityThreshold,
    highQualityThreshold: validatedBody.highQualityThreshold,
  });

  // Construct response object
  if ("error" in result) {
    const status = result.error.startsWith("Could not find") ? 404 : 400;
    return buildResponse(status, { error: result.error });
  }
  return buildResponse(200, result);
};

export interface EditRubricArgs {
  title?: string;
  lowQualityThreshold?: number;
  highQualityThreshold?: number;
}

export interface EditRubricParams extends EditRubricArgs {
  id: string;
}

export interface EditRubricResult {
  id: string;
  title: string;
  lowQualityThreshold: number;
  highQualityThreshold: number;
}

export interface EditRubricError {
  error: string;
}

interface RubricsSchema {
  id: string;
  title: string;
  low_score_threshold: number;
  high_score_threshold: number;
}

/**
 * Updates an existing rubric.
 * @prop id - ID of the rubric to update
 * @prop title - Updated rubric name
 * @prop lowQualityThreshold - Updated low quality threshold
 * @prop highQualityThreshold - Updated high quality threshold
 * @returns updated rubric, or error if update fails
 */

export async function editRubric(
  args: EditRubricParams,
): Promise<EditRubricResult | EditRubricError> {
  try {
    // Check whether at least one field was provided for updating
    if (
      args.title === undefined &&
      args.lowQualityThreshold === undefined &&
      args.highQualityThreshold === undefined
    ) {
      return { error: "No fields provided to update" };
    }

    // Validate title
    if (args.title !== undefined && args.title.trim() === "") {
      return { error: "title cannot be empty" };
    }

    // Check that low quality threshold is lower than high quality threshold
    if (
      args.lowQualityThreshold !== undefined &&
      args.highQualityThreshold !== undefined &&
      args.lowQualityThreshold >= args.highQualityThreshold
    ) {
      return {
        error: "lowQualityThreshold must be lower than highQualityThreshold",
      };
    }

    // Get existing threshold values
    const existingResult = await query<RubricsSchema>(
      `SELECT low_score_threshold, high_score_threshold
      FROM rubrics
      WHERE id = $1::uuid`,
      [args.id],
    );

    // Return error if rubric does not exist
    if (existingResult.rowCount === 0) {
      return {
        error: `Could not find rubric with ID ${args.id}`,
      };
    }

    // Determine final threshold values
    const existingRubric = existingResult.rows[0];

    const finalLowQualityThreshold =
      args.lowQualityThreshold ?? existingRubric.low_score_threshold;

    const finalHighQualityThreshold =
      args.highQualityThreshold ?? existingRubric.high_score_threshold;

    // Check if new lowQualityThreshold is larger than newer or older highQualityThreshold
    if (finalLowQualityThreshold >= finalHighQualityThreshold) {
      return {
        error: "lowQualityThreshold must be lower than highQualityThreshold",
      };
    }

    // Update the rubric
    const result = await query<RubricsSchema>(
      `UPDATE rubrics
       SET
         title = COALESCE($2, title),
         low_score_threshold = COALESCE($3, low_score_threshold),
         high_score_threshold = COALESCE($4, high_score_threshold)
       WHERE id = $1::uuid
       RETURNING id, title, low_score_threshold,
                 high_score_threshold`,
      [
        args.id,
        args.title?.trim() ?? null,
        args.lowQualityThreshold ?? null,
        args.highQualityThreshold ?? null,
      ],
    );

    // Return error if the chosen rubric does not exist
    if (result.rowCount === 0) {
      return {
        error: `Could not find rubric with ID ${args.id}`,
      };
    }

    // Construct response object
    const rubricRow = result.rows[0];

    return {
      id: rubricRow.id,
      title: rubricRow.title,
      lowQualityThreshold: rubricRow.low_score_threshold,
      highQualityThreshold: rubricRow.high_score_threshold,
    };
  } catch (err) {
    console.error("editRubric failed", err);
    return { error: "Failed to edit rubric" };
  }
}
