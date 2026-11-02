import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query } from "../db";
import { DatabaseError } from "pg";

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
  const bodyArgs = JSON.parse(event.body ?? "{}");

  // Make sure body has required parameters
  let error = "";

  if (!Object.hasOwn(bodyArgs, "name")) {
    error = "Missing body parameter: name";
  } else if (!Object.hasOwn(bodyArgs, "highQualityThreshold")) {
    error = "Missing body parameter: highQualityThreshold";
  } else if (!Object.hasOwn(bodyArgs, "lowQualityThreshold")) {
    error = "Missing body parameter: lowQualityThreshold";
  }

  // Make sure name is a non-empty string
  if (
    error === "" &&
    (typeof bodyArgs.name !== "string" || bodyArgs.name.trim() === "")
  ) {
    error = "name must be a non-empty string";
  }

  // Make sure thresholds are numbers
  const highQualityThreshold = bodyArgs.highQualityThreshold;
  const lowQualityThreshold = bodyArgs.lowQualityThreshold;

  if (error === "") {
    if (
      typeof highQualityThreshold !== "number" ||
      typeof lowQualityThreshold !== "number"
    ) {
      error = "highQualityThreshold and lowQualityThreshold must be numbers";
    } else if (
      !Number.isFinite(highQualityThreshold) ||
      !Number.isFinite(lowQualityThreshold)
    ) {
      error = "Thresholds must be valid numbers";
    } else if (
      highQualityThreshold < 0 ||
      highQualityThreshold > 100 ||
      lowQualityThreshold < 0 ||
      lowQualityThreshold > 100
    ) {
      error = "Thresholds must be between 0 and 100";
    } else if (lowQualityThreshold >= highQualityThreshold) {
      error = "lowQualityThreshold must be less than highQualityThreshold";
    }
  }

  // Return 400 early if there is an error
  if (error !== "") {
    return {
      statusCode: 400,
      body: JSON.stringify({ error }),
      ...resultParams,
    };
  }

  // Create rubric
  const result = await createRubric({
    title: bodyArgs.name.trim(),
    highQualityThreshold,
    lowQualityThreshold,
  });

  // Construct response object
  let status;
  let body;

  if ("error" in result) {
    status = 400;
    body = JSON.stringify(result);
  } else {
    status = 201;
    body = JSON.stringify(result);
  }

  return {
    statusCode: status,
    body,
    ...resultParams,
  };
};

export interface CreateRubricArgs {
  title: string;
  highQualityThreshold: number;
  lowQualityThreshold: number;
}

export interface CreateRubricResult {
  rubricID: string;
  title: string;
  questions: string[];
  highQualityThreshold: number;
  lowQualityThreshold: number;
  score: number;
  publicationDate: string;
  deprecationDate: null;
}

export interface CreateRubricError {
  error: string;
}

interface RubricsSchema {
  id: string;
  title: string;
  high_quality_threshold: number;
  low_quality_threshold: number;
  publication_date: Date;
}

export async function createRubric(
  args: CreateRubricArgs,
): Promise<CreateRubricResult | CreateRubricError> {
  try {
    // Create rubric entry and return the created row
    const createRubricResult = await query<RubricsSchema>(
      `INSERT INTO rubrics (
         title,
         high_quality_threshold,
         low_quality_threshold
       )
       VALUES ($1, $2::integer, $3::integer)
       RETURNING *`,
      [
        args.title,
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
      title: rubricRow.title,
      questions: [],
      highQualityThreshold: rubricRow.high_quality_threshold,
      lowQualityThreshold: rubricRow.low_quality_threshold,
      score: 0,
      publicationDate: rubricRow.publication_date.toISOString(),
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
        error: "Failed to create rubric",
      };
    }
  }
}

