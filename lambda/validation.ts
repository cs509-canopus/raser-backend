import * as z from "zod";

export interface ValidatedResultError {
  field: string;
  message: string;
}

export type ValidatedResult<T> =
  | { result: T; errors?: never }
  | { result?: never; errors: ValidatedResultError[] };

/**
 * Validates `args` against `schema`. If valid, returns the validated data, otherwise returns a list of validation errors.
 * @param schema - Zod object schema to validate against
 * @param args - Object to validate
 * @returns `result` containing the validated data, or `error` containing a list of validated errors
 */
export function validate<T extends z.ZodType>(
  schema: T,
  args: unknown,
): ValidatedResult<z.output<T>> {
  const parseResult = schema.safeParse(args);

  // Return data on success
  if (parseResult.success) {
    return {
      result: parseResult.data,
    };
  }

  // Collect all errors
  const bodyErrors: ValidatedResultError[] = parseResult.error.issues.map(
    (issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }),
  );

  return {
    errors: bodyErrors,
  };
}
