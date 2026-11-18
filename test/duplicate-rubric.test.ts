import {
  duplicateRubric,
  DuplicateRubricError,
  handler,
} from "../lambda/rubrics/duplicate-rubric";
import { query } from "../lambda/db";
import { describeWithDatabase, IDS } from "./db/describe-with-database";
import { readFileSync } from "fs";
import { join } from "path";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Inserts a rubric owned by designer1 and returns its ID.
 * @param published - whether to set a publication date
 * @param withQuestions - whether to add 2 questions to the rubric
 */
async function createTestRubric({
  published,
  withQuestions,
}: {
  published: boolean;
  withQuestions: boolean;
}): Promise<string> {
  const testID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const { rows } = await query(
    `INSERT INTO rubrics (id, designer_id, title, high_score_threshold, low_score_threshold, publication_date)
     VALUES ($1::uuid, $2::uuid, 'Test Rubric', 8, 4, $3) RETURNING *`,
    [testID, IDS.designer1, published ? "2026-02-01T09:00:00Z" : null],
  );
  expect(rows).toHaveLength(1);

  if (withQuestions) {
    await query(
      `INSERT INTO rubric_questions (rubric_id, section, index, question, score_explanations)
       VALUES ($1::uuid, 1, 1, 'Question 1', 'Explanation 1'),
              ($1::uuid, 2, 1, 'Question 2', 'Explanation 2')`,
      [testID],
    );
  }
  return testID;
}

/**
 * Returns the number of rubrics in the database
 */
async function countRubrics(): Promise<number> {
  const { rows } = await query("SELECT COUNT(*)::int AS count FROM rubrics");
  return rows[0].count;
}

/**
 * Returns all questions of the rubric with ID `rubricID`, without the rubric ID
 */
async function getQuestions(rubricID: string) {
  const { rows } = await query(
    `SELECT section, index, question, score_explanations
     FROM rubric_questions
     WHERE rubric_id = $1::uuid
     ORDER BY section, index`,
    [rubricID],
  );
  return rows;
}

/**
 * Checks that the rubric `newID` is a copy of rubric `originalID` owned by `userID`
 * @param hasQuestions - whether the original rubric is expected to have questions
 */
async function expectDuplicate(
  originalID: string,
  newID: string,
  userID: string,
  hasQuestions = true,
) {
  // Make sure a new ID was generated
  expect(newID).toMatch(UUID_REGEX);
  expect(newID).not.toBe(originalID);

  // Get both rubrics
  const { rows } = await query(
    `SELECT id, designer_id, title, high_score_threshold, low_score_threshold,
            publication_date, replaced_by_id, is_favorite
     FROM rubrics
     WHERE id = ANY($1::uuid[])`,
    [[originalID, newID]],
  );
  expect(rows).toHaveLength(2);
  const original = rows.find((row) => row.id === originalID);
  const copy = rows.find((row) => row.id === newID);

  // The new rubric is owned by the user who duplicated it
  expect(copy.designer_id).toBe(userID);

  // The new rubric has the same contents as the original
  expect(copy.title).toBe(original.title);
  expect(copy.high_score_threshold).toBe(original.high_score_threshold);
  expect(copy.low_score_threshold).toBe(original.low_score_threshold);

  // The new rubric is a fresh draft: unpublished, not deprecated, not a favorite
  expect(copy.publication_date).toBeNull();
  expect(copy.replaced_by_id).toBeNull();
  expect(copy.is_favorite).toBe(false);

  // The new rubric has all the same questions
  const originalQuestions = await getQuestions(originalID);
  if (hasQuestions) {
    expect(originalQuestions.length).toBeGreaterThan(0);
  } else {
    expect(originalQuestions).toHaveLength(0);
  }
  expect(await getQuestions(newID)).toEqual(originalQuestions);
}

describeWithDatabase("duplicateRubric", () => {
  it("fails on non-existant rubric", async () => {
    const invalidRubricID = IDS.userf; // all f's
    const rubricCount = await countRubrics();

    const result = await duplicateRubric({
      userID: IDS.designer1,
      rubricID: invalidRubricID,
    });

    // Make sure it errored
    expect(result).toHaveProperty("error");
    expect((result as DuplicateRubricError).error).toBe(
      `Rubric not found: ${invalidRubricID}`,
    );

    // Make sure no rubric was created
    expect(await countRubrics()).toBe(rubricCount);
  });

  it("duplicates a published rubric owned by another designer", async () => {
    // designer2 duplicates rubric1 (owned by designer1)
    const result = await duplicateRubric({
      userID: IDS.designer2,
      rubricID: IDS.rubric1,
    });

    // Check return value
    if ("error" in result) throw new Error(result.error);
    expect(result.generatedFrom).toBe(IDS.rubric1);

    // Check database
    await expectDuplicate(IDS.rubric1, result.rubricID, IDS.designer2);
  });

  it("lets a brand-new user duplicate a published rubric", async () => {
    // The user has no rows in the database yet, so they have to be created first
    const newUserID = "77777777-0000-4000-8000-000000000001";
    const result = await duplicateRubric({
      userID: newUserID,
      rubricID: IDS.rubric1,
    });
    if ("error" in result) throw new Error(result.error);

    await expectDuplicate(IDS.rubric1, result.rubricID, newUserID);
  });

  it("fails on unpublished rubric owned by another designer", async () => {
    // Create an unpublished rubric owned by designer1
    const unpublishedID = await createTestRubric({
      published: false,
      withQuestions: true,
    });
    const rubricCount = await countRubrics();

    // designer2 tries to duplicate it
    const result = await duplicateRubric({
      userID: IDS.designer2,
      rubricID: unpublishedID,
    });

    // Make sure it errored
    expect(result).toHaveProperty("error");
    expect((result as DuplicateRubricError).error).toBe(
      `Rubric not found: ${unpublishedID}`,
    );

    // Make sure no rubric was created
    expect(await countRubrics()).toBe(rubricCount);
  });

  it("duplicates a published rubric owned by the same designer", async () => {
    // Mark rubric1 as a favorite so the copy's is_favorite reset is meaningful
    await query("UPDATE rubrics SET is_favorite = true WHERE id = $1::uuid", [
      IDS.rubric1,
    ]);

    // designer1 duplicates rubric1 (owned by designer1)
    const result = await duplicateRubric({
      userID: IDS.designer1,
      rubricID: IDS.rubric1,
    });

    // Check return value
    if ("error" in result) throw new Error(result.error);
    expect(result.generatedFrom).toBe(IDS.rubric1);

    // Check database
    await expectDuplicate(IDS.rubric1, result.rubricID, IDS.designer1);
  });

  it("duplicates a deprecated rubric", async () => {
    // Deprecate rubric1 directly in the database (replaced by rubric2)
    await query(
      "UPDATE rubrics SET replaced_by_id = $1::uuid WHERE id = $2::uuid",
      [IDS.rubric2, IDS.rubric1],
    );

    // designer2 duplicates rubric1
    const result = await duplicateRubric({
      userID: IDS.designer2,
      rubricID: IDS.rubric1,
    });

    // Check return value
    if ("error" in result) throw new Error(result.error);
    expect(result.generatedFrom).toBe(IDS.rubric1);

    // Check database (the copy should not be deprecated)
    await expectDuplicate(IDS.rubric1, result.rubricID, IDS.designer2);

    // Make sure the original is still deprecated
    const { rows } = await query(
      "SELECT replaced_by_id FROM rubrics WHERE id = $1::uuid",
      [IDS.rubric1],
    );
    expect(rows[0].replaced_by_id).toBe(IDS.rubric2);
  });

  it("duplicates an unpublished rubric owned by the same designer", async () => {
    // Create an unpublished rubric owned by designer1
    const unpublishedID = await createTestRubric({
      published: false,
      withQuestions: true,
    });

    // designer1 duplicates it
    const result = await duplicateRubric({
      userID: IDS.designer1,
      rubricID: unpublishedID,
    });

    // Check return value
    if ("error" in result) throw new Error(result.error);
    expect(result.generatedFrom).toBe(unpublishedID);

    // Check database
    await expectDuplicate(unpublishedID, result.rubricID, IDS.designer1);
  });

  it("creates separate copies when duplicating twice", async () => {
    const rubricCount = await countRubrics();

    // designer2 duplicates rubric1 twice
    const result1 = await duplicateRubric({
      userID: IDS.designer2,
      rubricID: IDS.rubric1,
    });
    if ("error" in result1) throw new Error(result1.error);
    const result2 = await duplicateRubric({
      userID: IDS.designer2,
      rubricID: IDS.rubric1,
    });
    if ("error" in result2) throw new Error(result2.error);

    // Make sure the copies have different IDs
    expect(result1.rubricID).not.toBe(result2.rubricID);

    // Make sure exactly 2 rubrics were created
    expect(await countRubrics()).toBe(rubricCount + 2);

    // Make sure both are full copies of rubric1
    await expectDuplicate(IDS.rubric1, result1.rubricID, IDS.designer2);
    await expectDuplicate(IDS.rubric1, result2.rubricID, IDS.designer2);
  });

  it("does not change the original's questions when the copy is edited", async () => {
    const originalQuestions = await getQuestions(IDS.rubric1);

    // designer2 duplicates rubric1
    const result = await duplicateRubric({
      userID: IDS.designer2,
      rubricID: IDS.rubric1,
    });
    if ("error" in result) throw new Error(result.error);

    // Edit one of the copy's questions and delete another
    await query(
      `UPDATE rubric_questions SET question = 'Edited question'
       WHERE rubric_id = $1::uuid AND section = 1 AND index = 1`,
      [result.rubricID],
    );
    await query(
      `DELETE FROM rubric_questions
       WHERE rubric_id = $1::uuid AND section = 1 AND index = 2`,
      [result.rubricID],
    );

    // Make sure the copy changed
    const copyQuestions = await getQuestions(result.rubricID);
    expect(copyQuestions).toHaveLength(originalQuestions.length - 1);
    expect(copyQuestions[0].question).toBe("Edited question");

    // Make sure the original's questions did not change
    expect(await getQuestions(IDS.rubric1)).toEqual(originalQuestions);
  });

  it("duplicates a rubric with no questions", async () => {
    // Create a published rubric owned by designer1 with no questions
    const emptyID = await createTestRubric({
      published: true,
      withQuestions: false,
    });

    // designer2 duplicates it
    const result = await duplicateRubric({
      userID: IDS.designer2,
      rubricID: emptyID,
    });

    // Check return value
    if ("error" in result) throw new Error(result.error);
    expect(result.generatedFrom).toBe(emptyID);

    // Check database (the copy should also have no questions)
    await expectDuplicate(emptyID, result.rubricID, IDS.designer2, false);
  });

  it("duplicates rubric1 with the handler", async () => {
    // Parse event JSON
    const event = JSON.parse(
      readFileSync(
        join(
          __dirname,
          "events",
          "DuplicateRubric",
          "duplicate-rubric.event.jsonc",
        ),
        "utf-8",
      ),
    );

    // Parse response json
    const expected = JSON.parse(
      readFileSync(
        join(
          __dirname,
          "events",
          "DuplicateRubric",
          "duplicate-rubric.expected.jsonc",
        ),
        "utf-8",
      ),
    );

    // Validate response status and body
    // (the new rubricID is generated, so it is checked separately)
    const result = await handler(event);
    expect(result.statusCode).toBe(expected.statusCode);
    const body = JSON.parse(result.body);
    expect(body).toMatchObject(JSON.parse(expected.body));

    // Make sure the rubric was actually duplicated
    await expectDuplicate(
      event.pathParameters.rubricID,
      body.rubricID,
      event.requestContext.authorizer.claims.sub,
    );
  });
});
