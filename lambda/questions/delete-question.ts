import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query as realQuery } from "../db";
import {
  rubricExists,
  deleteRubricQuestion,
} from "./shared/rubric-questions-repo";
import {
  errorResult,
  type CoreResult,
  type QueryFn,
} from "./shared/types";

const resultParams: Partial<APIGatewayProxyResult> = {
  isBase64Encoded: false,
  headers: {
    "Access-Control-Allow-Origin": "*",
  },
  multiValueHeaders: {},
};

export async function deleteQuestionCore(
  rubricID: string | undefined,
  sectionParam: string | undefined,
  indexParam: string | undefined,
  query: QueryFn,
): Promise<CoreResult> {
  // Validate path parameters
  if (!rubricID) {
    return errorResult(400, "rubricID is required in the path");
  }

  if (sectionParam === undefined || sectionParam === "") {
    return errorResult(400, "section is required in the path");
  }

  if (indexParam === undefined || indexParam === "") {
    return errorResult(400, "index is required in the path");
  }

  const section = Number(sectionParam);
  const index = Number(indexParam);

  if (!Number.isSafeInteger(section) || section < 0) {
    return errorResult(400, "section must be a non-negative integer");
  }

  if (!Number.isSafeInteger(index) || index < 0) {
    return errorResult(400, "index must be a non-negative integer");
  }

  try {
    // Check whether the rubric exists
    const exists = await rubricExists(query, rubricID);

    if (!exists) {
      return errorResult(404, `Rubric ${rubricID} not found`);
    }

    // Delete the selected question
    const row = await deleteRubricQuestion(
      query,
      rubricID,
      section,
      index,
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
    console.error("deleteQuestionCore failed", err);

    return errorResult(500, `Failed to delete question: ${err}`);
  }
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const result = await deleteQuestionCore(
    event.pathParameters?.rubricID,
    event.pathParameters?.section,
    event.pathParameters?.index,
    realQuery,
  );

  return {
    statusCode: result.statusCode,
    body: JSON.stringify(result.body),
    ...resultParams,
  };
};