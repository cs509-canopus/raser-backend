import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { withTransaction } from "../db";
import { buildResponse } from "../response-builder";
import { validate } from "../validation";
import * as z from "zod";

const pathSchema = z.object({
  rubricID: z.uuid(),
});

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  // Extract path params
  const pathParams = event.pathParameters || {};
  const { result: validatedPath, errors: pathErrors } = validate(
    pathSchema,
    pathParams,
  );

  // Return 400 early on input error
  if (pathErrors) {
    return buildResponse(400, {
      error: "Input error",
      pathErrors,
    });
  }

  // Delete the selected rubric
  const result = await deleteRubric({
    rubricID: validatedPath.rubricID,
  });

  // Construct response object
  if ("error" in result) {
    const status = result.error.startsWith("Could not find") ? 404 : 500;
    return buildResponse(status, { error: result.error });
  }
  return buildResponse(200, result);
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
        `DELETE FROM "rubric_questions"
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
    return { error: `Failed to delete rubric: ${err}` };
  }
}
