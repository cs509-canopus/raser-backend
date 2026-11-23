import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { query as realQuery } from "../db";
import { rubricExists, insertRubricQuestion } from "./shared/rubric-questions-repo";
import {
  errorResult,
  type CoreResult,
  type QueryFn,
} from "./shared/types";
import { parseJsonBody, validateAddQuestionBody } from "./shared/validation";

const resultParams: Partial<APIGatewayProxyResult> = {
  isBase64Encoded: false,
  headers: {
    "Access-Control-Allow-Origin": "*",
  },
  multiValueHeaders: {},
};

export async function addQuestionCore(
  rubricID: string | undefined,
  rawBody: string | null,
  query: QueryFn,
): Promise<CoreResult> {
  if (!rubricID) {
    return errorResult(400, "rubricID is required in the path");
  }

  const parsedBody = parseJsonBody(rawBody);

  if (!parsedBody.ok) {
    return errorResult(400, parsedBody.error);
  }

  const validated = validateAddQuestionBody(parsedBody.value);

  if (!validated.ok) {
    return errorResult(400, validated.error);
  }

  try {
    const exists = await rubricExists(query, rubricID);

    if (!exists) {
      return errorResult(404, `Rubric ${rubricID} not found`);
    }

    const row = await insertRubricQuestion(
      query,
      rubricID,
      validated.value,
    );

    return {
      statusCode: 201,
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
    console.error("addQuestionCore failed", err);

    return errorResult(500, `Failed to add question: ${err}`);
  }
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const result = await addQuestionCore(
    event.pathParameters?.rubricID,
    event.body,
    realQuery,
  );

  return {
    statusCode: result.statusCode,
    body: JSON.stringify(result.body),
    ...resultParams,
  };
};
