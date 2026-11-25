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
  // Extract path params
  const pathParams = event.pathParameters || {};

  // Make sure rubricID is present in path parameter
  let error = "";
  if (!Object.hasOwn(pathParams, "rubricID")) {
    error = "Missing path parameter: rubricID";
  }

  // Parse request body
  let bodyArgs;
  try {
    bodyArgs = JSON.parse(event.body ?? "{}");
  } catch {
    error = "Invalid JSON body";
  }

  // Make sure body has required parameters
  if (error === "") {
    if (!Object.hasOwn(bodyArgs, "section")) {
      error = "Missing body parameter: section";
    } else if (!Object.hasOwn(bodyArgs, "index")) {
      error = "Missing body parameter: index";
    } else if (!Object.hasOwn(bodyArgs, "question")) {
      error = "Missing body parameter: question";
    } else if (!Object.hasOwn(bodyArgs, "scoreExplanations")) {
      error = "Missing body parameter: scoreExplanations";
    }
  }

  // Make sure section is a valid number
  if (
    error === "" &&
    (!Number.isInteger(bodyArgs.section) || bodyArgs.section < 0)
  ) {
    error = "section must be a non-negative integer";
  }

  // Make sure question is a non-empty string
  if (
    error === "" &&
    (typeof bodyArgs.question !== "string" ||
      bodyArgs.question.trim() === "")
  ) {
    error = "question must be a non-empty string";
  }

  // Make sure scoreExplanations is valid
  if (
    error === "" &&
    !Array.isArray(bodyArgs.scoreExplanations)
  ) {
    error = "scoreExplanations must be an array";
  }

  // Return 400 early if there is an error
  if (error !== "") {
    return {
      statusCode: 400,
      body: JSON.stringify({ error }),
      ...resultParams,
    };
  }

  // Create rubric question
  const result = await createRubricQuestion({
    rubricID: pathParams.rubricID!,
    section: bodyArgs.section,
    index: bodyArgs.section,
    question: bodyArgs.question.trim(),
    scoreExplanations: bodyArgs.scoreExplanations,
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

export interface CreateQuestionArgs {
  rubricID: string;
  section: number;
  index: number;
  question: string;
  scoreExplanations: string[];
}

export interface CreateQuestionResult {
  rubricID: string;
  section: number;
  index: number;
  question: string;
  scoreExplanations: string[];
}

export interface CreateQuestionError {
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
 * Creates a rubric question.
 * @prop rubricID - ID of the rubric containing the question
 * @prop section - Section where the question belongs
 * @prop question - Question text
 * @prop scoreExplanations - Score explanations associated with the question
 * @returns created question details, or error if creation fails
 */
export async function createRubricQuestion(
  args: CreateQuestionArgs,
): Promise<CreateQuestionResult | CreateQuestionError> {
  try {
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

    // Create rubric question and return the created row
    const createQuestionResult = await query<RubricQuestionsSchema>(
      `INSERT INTO "rubric_questions" (
         rubric_id,
         section,
         "index",
         question,
         score_explanations
       )
       VALUES ($1::uuid, $2, $3, $4, $5::jsonb)
       RETURNING *`,
      [
        args.rubricID,
        args.section,
        args.index,
        args.question,
        JSON.stringify(args.scoreExplanations),
      ],
    );

    // Return error if question was not created
    if (createQuestionResult.rowCount === 0) {
      return {
        error: "Could not create rubric question",
      };
    }

    // Construct response object
    const questionRow = createQuestionResult.rows[0];

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
    if (err instanceof DatabaseError && err.code === "23505") {
      // unique_violation
      console.error("Duplicate key error", err);
      return {
        error: "Rubric question already exists",
      };
    } else {
      console.error("createRubricQuestion failed", err);
      return {
        error: `Failed to create rubric question: ${err}`,
      };
    }
  }
}
