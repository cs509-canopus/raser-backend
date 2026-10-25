// Plain SQL against the `papers`/`issues` tables (db/schema.sql). Takes a QueryFn rather
// than importing ./db directly so it — and everything built on top of it — can be unit
// tested with a mock query function and no real Postgres connection.
import type { AddPaperInput } from "./validation";
import type { PaperRow, QueryFn } from "./types";

export async function issueExists(
  query: QueryFn,
  issueId: string,
): Promise<boolean> {
  const { rows } = await query("SELECT 1 FROM issues WHERE id = $1", [issueId]);
  return rows.length > 0;
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
