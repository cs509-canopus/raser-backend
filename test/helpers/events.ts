import type { APIGatewayProxyEvent } from "aws-lambda";

/**
 * Builds a minimal API gateway event for handler tests. If `userID` is given, it is put
 * where the Cognito authorizer puts the logged-in user's claims.
 */
export function buildEvent({
  userID,
  pathParameters = null,
  queryStringParameters = null,
  body = null,
}: {
  userID?: string;
  pathParameters?: Record<string, string> | null;
  queryStringParameters?: Record<string, string> | null;
  body?: object | null;
}): APIGatewayProxyEvent {
  return {
    pathParameters,
    queryStringParameters,
    body: body === null ? null : JSON.stringify(body),
    requestContext: {
      authorizer: userID ? { claims: { sub: userID } } : null,
    },
  } as unknown as APIGatewayProxyEvent;
}

/** A Cognito user that just signed up and has no rows in the database yet */
export const NEW_USER_ID = "77777777-0000-4000-8000-000000000001";
