import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { buildResponse } from "./response-builder";
import { validate } from "./validation";
import * as z from "zod";

const pathSchema = z.object({
  quantity: z.int().nonnegative(),
});

const bodySchema = z.object({
  text: z.string().nonempty(),
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

  // Extract paramters
  let text = validatedBody.text;
  let quantity = validatedPath.quantity;

  // Compute result. If result contains error key, return 400
  const result = echo({ text, quantity });
  const status = result.error ? 400 : 200;

  return buildResponse(status, result);
};

export interface EchoArgs {
  text: string;
  quantity: number;
}

export interface EchoResult {
  text?: string;
  error?: string;
}

export function echo(args: EchoArgs): EchoResult {
  // Make sure quantity is a positive integer
  if (!Number.isInteger(args.quantity)) {
    return {
      error: "Quantity must be an integer",
    };
  }
  if (args.quantity < 0) {
    return {
      error: "Quantity cannot be negative",
    };
  }

  // Happy case:
  return {
    text: args.text.repeat(args.quantity),
  };
}
