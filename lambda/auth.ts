import type { APIGatewayProxyEvent } from "aws-lambda";

/**
 * Returns the ID of the logged-in user that made the request. This is the `sub` claim
 * of the Cognito ID token, which the API gateway authorizer puts on the request after
 * verifying the token.
 * @param event - API gateway event passed to the handler
 * @returns user ID, or `undefined` if the request has no logged-in user
 */
export function getUserID(event: APIGatewayProxyEvent): string | undefined {
  const sub = event.requestContext?.authorizer?.claims?.sub;
  return typeof sub === "string" && sub.length > 0 ? sub : undefined;
}
