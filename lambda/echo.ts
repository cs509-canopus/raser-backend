import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { buildResponse } from "./response-builder";

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const bodyArgs = JSON.parse(event.body ?? "{}");
  const pathParams = event.pathParameters || {};
  let error = "";

  // Makes sure path has "quantity" and body has the "text" parameter
  if (!Object.hasOwn(pathParams, "quantity")) {
    error = "Missing path parameter: quantity";
  }
  if (!Object.hasOwn(bodyArgs, "text")) {
    error = "Missing body parameter: text";
  }

  // Return 400 early if there is an error
  if (error != "") {
    return buildResponse(400, { error: error });
  }

  // Extract paramters
  let text = bodyArgs.text;
  let quantity = Number(pathParams.quantity!);

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
