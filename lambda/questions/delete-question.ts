import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { withTransaction } from "../db";

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

  // Check required path parameters are present
  let error = "";
  if (!Object.hasOwn(pathParams, "rubricID")) {
    error = "Missing path parameter: rubricID";
  } else if (!Object.hasOwn(pathParams, "section")) {
    error = "Missing path parameter: section";
  } else if (!Object.hasOwn(pathParams, "index")) {
    error = "Missing path parameter: index";
  }

  // Return 400 early if there is an error
  if (error != "") {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: error }),
      ...resultParams,
    };
  }

  // Delete the selected rubric question
  const result = await deleteRubricQuestion({
    rubricID: pathParams.rubricID!,
    section: Number(pathParams.section),
    index: Number(pathParams.index),
  });

  // Construct response object
  let status;
  let body;
  if ("error" in result) {
    status = result.error.startsWith("Could not find") ? 404 : 500;
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

export interface DeleteQuestionArgs {
  rubricID: string;
  section: number;
  index: number;
}

export interface DeleteQuestionResult {
  rubricID: string;
  section: number;
  index: number;
}

export interface DeleteQuestionError {
  error: string;
}

/**
 * Deletes a rubric question.
 * @prop rubricID - ID of the rubric containing the question
 * @prop section - Section containing the question
 * @prop index - Index of the question to delete
 * @returns deleted question section and index with rubricID, or error if deletion fails
 */
export async function deleteRubricQuestion(
  args: DeleteQuestionArgs,
): Promise<DeleteQuestionResult | DeleteQuestionError> {
  try {
    return await withTransaction(async (client) => {
      // Check whether the rubric exists
      const rubricResult = await client.query(
        `SELECT id FROM rubrics
         WHERE id = $1::uuid
         FOR UPDATE`,
        [args.rubricID],
      );

      // Return error if the chosen rubric does not exist
      if (rubricResult.rowCount === 0) {
        return {
          error: `Could not find rubric with ID ${args.rubricID}`,
        };
      }

      // Delete the selected rubric question
      const questionResult = await client.query(
        `DELETE FROM "rubric_questions"
         WHERE rubric_id = $1::uuid
         AND section = $2
         AND question_index = $3
         RETURNING rubric_id`,
        [args.rubricID, args.section, args.index],
      );

      // Return error if the question does not exist
      if (questionResult.rowCount === 0) {
        return {
          error: `Could not find question at section ${args.section}, index ${args.index} in rubric ${args.rubricID}`,
        };
      }

      return {
        rubricID: args.rubricID,
        section: args.section,
        index: args.index,
      };
    });
  } catch (err) {
    console.error("deleteRubricQuestion failed", err);
    return { error: `Failed to delete rubric question: ${err}` };
  }
}
