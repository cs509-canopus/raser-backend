export interface AddQuestionInput {
  section: number;
  question: string;
  scoreExplanations: string[];
}

export function parseJsonBody(
  rawBody: string | null,
):
  | { ok: true; value: unknown }
  | { ok: false; error: string } {
  if (!rawBody) {
    return { ok: false, error: "Request body is required" };
  }

  try {
    return {
      ok: true,
      value: JSON.parse(rawBody),
    };
  } catch {
    return {
      ok: false,
      error: "Invalid JSON request body",
    };
  }
}

export function validateAddQuestionBody(
  body: unknown,
):
  | { ok: true; value: AddQuestionInput }
  | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Request body must be an object" };
  }

  const data = body as Record<string, unknown>;

  if (
    typeof data.section !== "number" ||
    !Number.isInteger(data.section) ||
    data.section < 1
  ) {
    return { ok: false, error: "section must be a positive integer" };
  }

  if (
    typeof data.question !== "string" ||
    !data.question.trim()
  ) {
    return { ok: false, error: "question is required" };
  }

  if (
    !Array.isArray(data.scoreExplanations) ||
    data.scoreExplanations.length !== 5 ||
    !data.scoreExplanations.every(
      (item) => typeof item === "string" && item.trim().length > 0,
    )
  ) {
    return {
      ok: false,
      error: "scoreExplanations must contain exactly 5 non-empty strings",
    };
  }

  return {
    ok: true,
    value: {
      section: data.section,
      question: data.question.trim(),
      scoreExplanations: data.scoreExplanations.map(
        (item: string) => item.trim(),
      ),
    },
  };
}


export interface EditQuestionInput {
  question: string;
  scoreExplanations: string[];
}

export function validateEditQuestionBody(
  body: unknown,
):
  | { ok: true; value: EditQuestionInput }
  | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Request body must be an object" };
  }

  const data = body as Record<string, unknown>;

  if (
    typeof data.question !== "string" ||
    !data.question.trim()
  ) {
    return { ok: false, error: "question is required" };
  }

  if (
    !Array.isArray(data.scoreExplanations) ||
    data.scoreExplanations.length !== 5 ||
    !data.scoreExplanations.every(
      (item) => typeof item === "string" && item.trim().length > 0,
    )
  ) {
    return {
      ok: false,
      error: "scoreExplanations must contain exactly 5 non-empty strings",
    };
  }

  return {
    ok: true,
    value: {
      question: data.question.trim(),
      scoreExplanations: data.scoreExplanations.map(
        (item: string) => item.trim(),
      ),
    },
  };
}

