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

  // Make sure required path parameters are present
  let error = "";
  if (!Object.hasOwn(pathParams, "rubricID")) {
    error = "Missing path parameter: rubricID";
  } else if (!Object.hasOwn(pathParams, "section")) {
    error = "Missing path parameter: section";
  } else if (!Object.hasOwn(pathParams, "index")) {
    error = "Missing path parameter: index";
  }

  // Return 400 early if there is an error
  if (error !== "") {
    return {
      statusCode: 400,
      body: JSON.stringify({ error }),
      ...resultParams,
    };
  }

  // Parse request body
  let args: EditQuestionArgs;
  try {
    args = JSON.parse(event.body ?? "{}");
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON request body" }),
      ...resultParams,
    };
  }

  // Edit the selected rubric question
  const result = await editRubricQuestion({
    rubricID: pathParams.rubricID!,
    section: Number(pathParams.section),
    index: Number(pathParams.index),
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

export interface EditQuestionArgs {
  question: string;
  scoreExplanations: string[];
}

export interface EditQuestionParams extends EditQuestionArgs {
  rubricID: string;
  section: number;
  index: number;
}

export interface EditQuestionResult {
  rubricID: string;
  section: number;
  index: number;
  question: string;
  scoreExplanations: string[];
}

export interface EditQuestionError {
  error: string;
}

interface RubricQuestionsSchema {
  rubric_id: string;
  section: number;
  index: number;
  question: string;
  score_explanations: string | null;
}

/**
 * Updates an existing rubric question.
 * @prop rubricID - ID of the rubric containing the question
 * @prop section - Section containing the question
 * @prop index - Index of the question to update
 * @prop question - Updated question text
 * @prop scoreExplanations - Updated score explanations
 * @returns updated question, or error if update fails
 */

export async function editRubricQuestion(
  args: EditQuestionParams,
): Promise<EditQuestionResult | EditQuestionError> {
  try {
    // Validate path parameters
    if (!Number.isSafeInteger(args.section) || args.section < 1) {
      return {
        error: "section must be a positive integer",
      };
    }

    if (!Number.isSafeInteger(args.index) || args.index < 0) {
      return {
        error: "index must be a non-negative integer",
      };
    }

    // Validate question
    if (
      typeof args.question !== "string" ||
      args.question.trim() === ""
    ) {
      return {
        error: "question must be a non-empty string",
      };
    }

    // Validate score explanations
    if (
      !Array.isArray(args.scoreExplanations) ||
      !args.scoreExplanations.every(
        (explanation) => typeof explanation === "string",
      )
    ) {
      return {
        error: "scoreExplanations must be an array of strings",
      };
    }

    // Check whether the rubric exists
    const rubricResult = await query(
      `SELECT id FROM rubrics
       WHERE id = $1::uuid`,
      [args.rubricID],
    );

    // Return error if the chosen rubric does not exist
    if (rubricResult.rowCount === 0) {
      return {
        error: `Could not find rubric with ID ${args.rubricID}`,
      };
    }

    // Update the rubric question
    const result = await query<RubricQuestionsSchema>(
      `UPDATE "rubric_questions"
       SET
         question = $4,
         score_explanations = $5::jsonb
       WHERE rubric_id = $1::uuid
         AND section = $2
         AND "index" = $3
       RETURNING rubric_id, section, "index" AS index,
                 question, score_explanations`,
      [
        args.rubricID,
        args.section,
        args.index,
        args.question.trim(),
        JSON.stringify(args.scoreExplanations),
      ],
    );

    // Return error if the question does not exist
    if (result.rowCount === 0) {
      return {
        error: `Could not find question in rubric ${args.rubricID}, section ${args.section}, index ${args.index}`,
      };
    }

    // Construct response object
    const questionRow = result.rows[0];

    return {
      rubricID: questionRow.rubric_id,
      section: questionRow.section,
      index: questionRow.index,
      question: questionRow.question,
      scoreExplanations: JSON.parse(
        questionRow.score_explanations ?? "[]",
      ),
    };
  } catch (err) {
    console.error("editRubricQuestion failed", err);
    return {
      error: `Failed to edit rubric question: ${err}`,
    };
  }
}
