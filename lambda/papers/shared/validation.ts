// Request body validation for POST /issues/{issueID}/papers (issue #13).

export interface AddPaperInput {
  title: string;
  authors: string[];
  publicationDate: string | null;
  paperUrl: string | null;
}

type ValidationResult =
  { ok: true; value: AddPaperInput } | { ok: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseJsonBody(
  raw: string | null,
): { ok: true; value: unknown } | { ok: false; error: string } {
  if (raw == null || raw.trim() === "") {
    return { ok: false, error: "Request body is required" };
  }
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, error: "Request body must be valid JSON" };
  }
}

/**
 * DESIGN FLAG for Krishna: the ERD makes `authors` a required NOT NULL column but
 * defaults it to '{}' (empty array) at the DB level, so the database itself doesn't
 * force a paper to be submitted with authors filled in. This validation follows the
 * DB's lead and treats `authors` as optional (defaulting to []) rather than requiring at
 * least one — confirm that's actually right; a paper with zero authors feels like it
 * shouldn't be possible in practice, the schema just doesn't forbid it.
 */
export function validateAddPaperBody(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (!isNonEmptyString(b.title)) {
    return {
      ok: false,
      error: "title is required and must be a non-empty string",
    };
  }

  let authors: string[] = [];
  if (b.authors !== undefined) {
    if (!Array.isArray(b.authors) || !b.authors.every(isNonEmptyString)) {
      return {
        ok: false,
        error: "authors must be an array of non-empty strings",
      };
    }
    authors = b.authors as string[];
  }

  let publicationDate: string | null = null;
  if (b.publicationDate !== undefined && b.publicationDate !== null) {
    if (
      !isNonEmptyString(b.publicationDate) ||
      !ISO_DATE.test(b.publicationDate)
    ) {
      return {
        ok: false,
        error: "publicationDate must be a YYYY-MM-DD date string",
      };
    }
    publicationDate = b.publicationDate;
  }

  let paperUrl: string | null = null;
  if (b.paperUrl !== undefined && b.paperUrl !== null) {
    // Deliberately loose (scheme check only, no full URL parse) — good enough to catch
    // "someone pasted a title in here by mistake" without rejecting valid-but-unusual URLs.
    if (!isNonEmptyString(b.paperUrl) || !/^https?:\/\//.test(b.paperUrl)) {
      return { ok: false, error: "paperUrl must be an http(s) URL" };
    }
    paperUrl = b.paperUrl;
  }

  return {
    ok: true,
    value: {
      title: (b.title as string).trim(),
      authors,
      publicationDate,
      paperUrl,
    },
  };
}
