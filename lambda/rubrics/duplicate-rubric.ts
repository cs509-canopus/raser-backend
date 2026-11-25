import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query, withTransaction } from "../db";
import { getUserID } from "../auth";
import { buildResponse } from "../response-builder";
import { ensureRubricDesigner } from "../users";
import { validate } from "../validation";
import * as z from "zod";

const pathSchema = z.object({
  rubricID: z.uuid(),
});

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  // Extract and validate path params
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
  const result = await duplicateRubric({
    userID,
    rubricID: validatedPath.rubricID,
  });

  // Construct response object
  if ("error" in result) {
    let status = 400;
    if (result.error.includes("not found")) {
      status = 404;
    } else if (result.error.startsWith("Failed")) {
      status = 500;
    }
    return buildResponse(status, { error: result.error });
  }
  return buildResponse(200, result);
};

export interface DuplicateRubricArgs {
  userID: string;
  rubricID: string;
}

export interface DuplicateRubricResult {
  rubricID: string; // ID of the new rubric
  generatedFrom: string;
}

export interface DuplicateRubricError {
  error: string;
}

const RUBRIC_FIELDS_TO_DUPLICATE =
  "title, high_score_threshold, low_score_threshold";
const QUESTION_FIELDS_TO_DUPLICATE =
  "section, index, question, score_explanations";

export async function duplicateRubric(
  args: DuplicateRubricArgs,
): Promise<DuplicateRubricResult | DuplicateRubricError> {
  try {
    // Check if the rubric is published (under any user) or is unpublished under this user
    const findRubricResult = await query(
      `SELECT 1 FROM rubrics 
       WHERE id = $1::uuid
       AND (
         publication_date IS NOT NULL
         OR designer_id = $2
       )`,
      [args.rubricID, args.userID],
    );

    // Return error if the chosen rubric was not found
    if (findRubricResult.rowCount === 0) {
      return {
        error: `Rubric not found: ${args.rubricID}`,
      };
    }

    return await withTransaction(async (client) => {
      // A new user has no database rows until they create something
      await ensureRubricDesigner(client, args.userID);

      // Create a new unpublished rubric under this user with same values as the specified rubric
      const insertRubricResult = await client.query(
        `INSERT INTO rubrics (designer_id, ${RUBRIC_FIELDS_TO_DUPLICATE})
         SELECT $1, ${RUBRIC_FIELDS_TO_DUPLICATE} FROM rubrics
         WHERE id = $2::uuid
         RETURNING id`,
        [args.userID, args.rubricID],
      );

      // Return error if insert failed
      if (insertRubricResult.rowCount === 0) {
        return {
          error: "Failed to duplicate rubric",
        };
      }

      // Create new rubric questions on the new rubric
      const newRubricID = insertRubricResult.rows[0].id as string;
      await client.query(
        `INSERT INTO rubric_questions (rubric_id, ${QUESTION_FIELDS_TO_DUPLICATE})
         SELECT $1::uuid, ${QUESTION_FIELDS_TO_DUPLICATE} FROM rubric_questions
         WHERE rubric_id = $2::uuid`,
        [newRubricID, args.rubricID],
      );

      return {
        rubricID: newRubricID,
        generatedFrom: args.rubricID,
      };
    });
  } catch (err) {
    console.error("duplicateRubric failed", err);
    return { error: "Failed to duplicate rubric" };
  }
}
