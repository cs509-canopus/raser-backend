import type { QueryFn } from "./types";
import type { AddQuestionInput } from "./validation";

export interface RubricQuestionRow {
  rubric_id: string;
  section: number;
  index: number;
  question: string | null;
  score_explanations: string | null;
}

export async function rubricExists(
  query: QueryFn,
  rubricID: string,
): Promise<boolean> {
  const result = await query(
    `SELECT id FROM rubrics WHERE id = $1`,
    [rubricID],
  );

  return result.rows.length > 0;
}

export async function insertRubricQuestion(
  query: QueryFn,
  rubricID: string,
  input: AddQuestionInput,
): Promise<RubricQuestionRow> {
  const result = await query(
    `
      INSERT INTO rubric_questions (
        rubric_id,
        section,
        "index",
        question,
        score_explanations
      )
      SELECT
        $1,
        $2,
        COALESCE(MAX("index") + 1, 0),
        $3,
        $4
      FROM rubric_questions
      WHERE rubric_id = $1
        AND section = $2
      RETURNING *
    `,
    [
      rubricID,
      input.section,
      input.question,
      JSON.stringify(input.scoreExplanations),
    ],
  );

    return result.rows[0] as unknown as RubricQuestionRow;
}

export async function deleteRubricQuestion(
  query: QueryFn,
  rubricID: string,
  section: number,
  index: number,
): Promise<RubricQuestionRow | null> {
  const result = await query(
    `
      DELETE FROM rubric_questions
      WHERE rubric_id = $1
        AND section = $2
        AND "index" = $3
      RETURNING *
    `,
    [rubricID, section, index],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as unknown as RubricQuestionRow;
}
