import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query as realQuery } from "../db";
import {
  rubricExists,
  updateRubricQuestion,
} from "./shared/rubric-questions-repo";
import {
  errorResult,
  type CoreResult,
  type QueryFn,
} from "./shared/types";
import {
  parseJsonBody,
  validateEditQuestionBody,
} from "./shared/validation";

const resultParams: Partial<APIGatewayProxyResult> = {
  isBase64Encoded: false,
  headers: {
    "Access-Control-Allow-Origin": "*",
  },
  multiValueHeaders: {},
};

export async function editQuestionCore(
  rubricID: string | undefined,
  sectionParam: string | undefined,
  indexParam: string | undefined,
  rawBody: string | null,
  query: QueryFn,
): Promise<CoreResult> {
  // Validate path parameters
  if (!rubricID) {
    return errorResult(400, "rubricID is required in the path");
  }

  if (sectionParam === undefined || sectionParam === "") {
    return errorResult(400, "sectionNumber is required in the path");
  }

  if (indexParam === undefined || indexParam === "") {
    return errorResult(400, "index is required in the path");
  }

  const section = Number(sectionParam);
  const index = Number(indexParam);

  if (
    !Number.isSafeInteger(section) ||
    section < 1
  ) {
    return errorResult(
      400,
      "sectionNumber must be a positive integer",
    );
  }

  if (
    !Number.isSafeInteger(index) ||
    index < 0
  ) {
    return errorResult(
      400,
      "index must be a non-negative integer",
    );
  }

  // Parse and validate request body
  const parsedBody = parseJsonBody(rawBody);

  if (!parsedBody.ok) {
    return errorResult(400, parsedBody.error);
  }

  const validated = validateEditQuestionBody(parsedBody.value);

  if (!validated.ok) {
    return errorResult(400, validated.error);
  }

  try {
    // Check whether the rubric exists
    const exists = await rubricExists(query, rubricID);

    if (!exists) {
      return errorResult(404, `Rubric ${rubricID} not found`);
    }

    // Update the selected question
    const row = await updateRubricQuestion(
      query,
      rubricID,
      section,
      index,
      validated.value,
    );

    if (!row) {
      return errorResult(
        404,
        `Question not found in rubric ${rubricID}, section ${section}, index ${index}`,
      );
    }

    return {
      statusCode: 200,
      body: {
        rubricID: row.rubric_id,
        section: row.section,
        index: row.index,
        question: row.question,
        scoreExplanations: JSON.parse(
          row.score_explanations ?? "[]",
        ),
      },
    };
  } catch (err) {
    console.error("editQuestionCore failed", err);

    return errorResult(500, `Failed to edit question: ${err}`);
  }
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const result = await editQuestionCore(
    event.pathParameters?.rubricID,
    event.pathParameters?.section,
    event.pathParameters?.index,
    event.body,
    realQuery,
  );

  return {
    statusCode: result.statusCode,
    body: JSON.stringify(result.body),
    ...resultParams,
  };
};
