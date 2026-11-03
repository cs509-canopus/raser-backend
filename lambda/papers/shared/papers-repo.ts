import type { AddPaperInput } from "./validation";
import type { PaperRow, QueryFn } from "./types";

export async function issueExists(
  query: QueryFn,
  issueId: string,
): Promise<boolean> {
  const { rows } = await query("SELECT 1 FROM issues WHERE id = $1", [issueId]);
  return rows.length > 0;
}

export async function journalIdForIssue(
  query: QueryFn,
  issueId: string,
): Promise<string | null> {
  const { rows } = await query(
    "SELECT journal_id FROM issues WHERE id = $1",
    [issueId],
  );
  const row = rows[0] as { journal_id: string } | undefined;
  return row?.journal_id ?? null;
}

const PAPER_COLUMNS =
  "id, issue_id, title, is_closed, authors, publication_date, paper_url, created_at";

export async function insertPaper(
  query: QueryFn,
  issueId: string,
  input: AddPaperInput,
): Promise<PaperRow> {
  const { rows } = await query(
    `INSERT INTO papers (issue_id, title, authors, publication_date, paper_url)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${PAPER_COLUMNS}`,
    [
      issueId,
      input.title,
      input.authors,
      input.publicationDate,
      input.paperUrl,
    ],
  );
  return rows[0] as unknown as PaperRow;
}

export async function getPaperById(
  query: QueryFn,
  paperId: string,
): Promise<PaperRow | null> {
  const { rows } = await query(
    `SELECT ${PAPER_COLUMNS} FROM papers WHERE id = $1`,
    [paperId],
  );
  return (rows[0] as unknown as PaperRow) ?? null;
}

export async function closePaper(
  query: QueryFn,
  paperId: string,
): Promise<PaperRow | null> {
  const { rows } = await query(
    `UPDATE papers SET is_closed = true WHERE id = $1 RETURNING ${PAPER_COLUMNS}`,
    [paperId],
  );
  return (rows[0] as unknown as PaperRow) ?? null;
}

export interface PaperViewInfo {
  journalId: string;
  issueId: string;
  title: string;
  isClosed: boolean;
  authors: string[];
  publicationDate: string | null;
  paperUrl: string | null;
  reviewIds: string[];
}

export async function getPaperViewInfo(
  query: QueryFn,
  paperId: string,
): Promise<PaperViewInfo | null> {
  // return date as YYYY-MM-DD string
  const { rows } = await query(
    `SELECT j.id AS journal_id, i.id AS issue_id, p.title, p.is_closed, p.authors,
            to_char(p.publication_date, 'YYYY-MM-DD') AS publication_date,
            p.paper_url
     FROM papers p
     JOIN issues i ON i.id = p.issue_id
     JOIN journals j ON j.id = i.journal_id
     WHERE p.id = $1`,
    [paperId],
  );
  const row = rows[0] as
    | {
        journal_id: string;
        issue_id: string;
        title: string;
        is_closed: boolean;
        authors: string[];
        publication_date: string | null;
        paper_url: string | null;
      }
    | undefined;
  if (!row) return null;

  const reviews = await query(
    "SELECT id FROM reviews WHERE paper_id = $1",
    [paperId],
  );
  const reviewIds = reviews.rows.map((r) => (r as { id: string }).id);

  return {
    journalId: row.journal_id,
    issueId: row.issue_id,
    title: row.title,
    isClosed: row.is_closed,
    authors: row.authors,
    publicationDate: row.publication_date,
    paperUrl: row.paper_url,
    reviewIds,
  };
}

export async function hasIncompleteReview(
  query: QueryFn,
  paperId: string,
): Promise<boolean> {
  const { rows } = await query(
    "SELECT 1 FROM reviews WHERE paper_id = $1 AND completed = false LIMIT 1",
    [paperId],
  );
  return rows.length > 0;
}
