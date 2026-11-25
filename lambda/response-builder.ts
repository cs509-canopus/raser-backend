import type { APIGatewayProxyResult } from "aws-lambda";

/**
 * Constructs a Lambda proxy response with status `statusCode` and body `body`
 * and all necessary response headers.
 * @param statusCode - HTTP status code
 * @param body - response object
 * @returns Lambda proxy response object
 */
export function buildResponse(
  statusCode: number,
  body: Object,
): APIGatewayProxyResult {
  return {
    statusCode,
    body: JSON.stringify(body),
    isBase64Encoded: false,
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
    multiValueHeaders: {},
  };
}
