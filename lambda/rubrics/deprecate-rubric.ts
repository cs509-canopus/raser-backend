import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { withTransaction } from "../db";
import { getUserID } from "../auth";
import { buildResponse } from "../response-builder";
import { validate } from "../validation";
import * as z from "zod";

const pathSchema = z.object({
  rubricID: z.uuid(),
});

const bodySchema = z.object({
  replacementID: z.uuid(),
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
  // Get ID of logged-in user
  const userID = getUserID(event);
  if (!userID) {
    return buildResponse(401, { error: "Unauthorized" });
  }

  // Delete the selected rubric
  const result = await deprecateRubric({
    userID,
    rubricID: validatedPath.rubricID,
    replacementID: validatedBody.replacementID,
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

export interface DeprecateRubricArgs {
  userID: string;
  rubricID: string;
  replacementID: string;
}

export interface DeprecateRubricResult {
  rubricID: string;
  replacementID: string;
  deprecationDate: Date;
}

export interface DeprecateRubricError {
  error: string;
}

export async function deprecateRubric(
  args: DeprecateRubricArgs,
): Promise<DeprecateRubricResult | DeprecateRubricError> {
  if (args.rubricID === args.replacementID) {
    return {
      error: "Cannot replace rubric with itself",
    };
  }

  try {
    return await withTransaction(async (client) => {
      // Check whether the rubric exists under this user
      const rubricResult = await client.query(
        `SELECT 
           id, 
           (publication_date IS NOT NULL) as is_published,
           (replaced_by_id IS NOT NULL) as is_deprecated
         FROM rubrics
         WHERE id = $1::uuid
         AND designer_id = $2
         FOR UPDATE`,
        [args.rubricID, args.userID],
      );

      // Return error if the chosen rubric does not exist
      if (rubricResult.rowCount === 0) {
        return {
          error: `Rubric not found: ${args.rubricID}`,
        };
      }

      // Return error if the rubric is not published
      if (!rubricResult.rows[0].is_published) {
        return {
          error: "Cannot deprecate an unpublished rubric",
        };
      }

      // Return error if the rubric is already deprecated
      if (rubricResult.rows[0].is_deprecated) {
        return {
          error: "Cannot deprecate an already deprecated rubric",
        };
      }

      // Check whether the replacement rubric exists as a published rubric
      const replacementRubricResult = await client.query(
        `SELECT id FROM rubrics
         WHERE id = $1::uuid
         AND publication_date IS NOT NULL`,
        [args.replacementID],
      );

      // Return error if the replacement rubric does not exist
      if (replacementRubricResult.rowCount === 0) {
        return {
          error: `Replacement rubric not found: ${args.replacementID}`,
        };
      }

      // Deprecate the rubric by setting the replacement ID
      await client.query(
        `UPDATE rubrics SET 
         replaced_by_id = $1::uuid
         WHERE id = $2::uuid`,
        [args.replacementID, args.rubricID],
      );

      return {
        rubricID: args.rubricID,
        replacementID: args.replacementID,
        deprecationDate: new Date(), // current date. TODO: replace with database entry
      };
    });
  } catch (err) {
    console.error("deprecateRubric failed", err);
    return { error: "Failed to deprecate rubric" };
  }
}
