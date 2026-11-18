import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { withTransaction } from "../db";
import { getUserID } from "../auth";
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

  // Get ID of logged-in user
  const userID = getUserID(event);
  if (!userID) {
    return buildResponse(401, { error: "Unauthorized" });
  }

  // Delete the selected rubric
  const result = await deleteRubric({
    userID,
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
  userID: string;
  rubricID: string;
}

export interface DeleteRubricResult {
  rubricID: string;
}

export interface DeleteRubricError {
  error: string;
}

/**
 * Deletes a rubric owned by the user and all its associated rubric questions.
 * @prop userID - ID of the logged-in user
 * @prop rubricID - ID of the rubric to delete
 * @returns deleted rubric ID, or error if deletion fails
 */
export async function deleteRubric(
  args: DeleteRubricArgs,
): Promise<DeleteRubricResult | DeleteRubricError> {
  try {
    return await withTransaction(async (client) => {
      // Check whether the rubric exists under this user
      const rubricResult = await client.query(
        `SELECT id FROM rubrics
         WHERE id = $1::uuid
           AND designer_id = $2
         FOR UPDATE`,
        [args.rubricID, args.userID],
      );

      // Return error if the chosen rubric does not exist under this user
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
