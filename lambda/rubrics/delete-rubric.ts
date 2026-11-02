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

  // Delete the selected rubric
  const result = await deleteRubric({
    rubricID: pathParams.rubricID!,
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

export interface DeleteRubricArgs {
  rubricID: string;
}

export interface DeleteRubricResult {
  rubricID: string;
}

export interface DeleteRubricError {
  error: string;
}

/**
 * Deletes a rubric and all its associated rubric questions.
 * @prop rubricID - ID of the rubric to delete
 * @returns deleted rubric ID, or error if deletion fails
 */
export async function deleteRubric(
  args: DeleteRubricArgs,
): Promise<DeleteRubricResult | DeleteRubricError> {
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

      // Delete all linked rubric questions
      await client.query(
        `DELETE FROM "rubricQuestion"
         WHERE rubric_id = $1::uuid`,
        [args.rubricID],
      );

      // Delete the rubric
      await client.query(
        `DELETE FROM rubrics
         WHERE id = $1::uuid`,
        [args.rubricID],
      );

      return {
        rubricID: args.rubricID,
      };
    });
  } catch (err) {
    console.error("deleteRubric failed", err);
    return { error: "Failed to delete rubric" };
  }
}
