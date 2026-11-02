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
  // Extract path params
  const pathParams = event.pathParameters || {};

  // Make sure rubricID is present in path parameter
  let error = "";
  if (!Object.hasOwn(pathParams, "rubricID")) {
    error = "Missing path parameter: rubricID";
  }

  // Return 400 early if there is an error
  if (error != "") {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: error }),
      ...resultParams,
    };
  }

  // Parse request body
  let args: EditRubricArgs;
  try {
    args = JSON.parse(event.body ?? "{}");
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON request body" }),
      ...resultParams,
    };
  }

  // Edit the selected rubric
  const result = await editRubric({
    id: pathParams.rubricID!,
    ...args,
  });

  // Construct response object
  let status;
  let body;

  if ("error" in result) {
    status = result.error.startsWith("Could not find") ? 404 : 400;
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

    // Validate threshold values
    if (
      args.lowQualityThreshold !== undefined &&
      (args.lowQualityThreshold < 0 || args.lowQualityThreshold > 100)
    ) {
      return { error: "lowQualityThreshold must be between 0 and 100" };
    }

    if (
      args.highQualityThreshold !== undefined &&
      (args.highQualityThreshold < 0 || args.highQualityThreshold > 100)
    ) {
      return { error: "highQualityThreshold must be between 0 and 100" };
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

