import { deleteRubric, handler } from "../lambda/rubrics/delete-rubric";
import { query } from "../lambda/db";
import { describeWithDatabase, IDS } from "./db/describe-with-database";
import { buildEvent } from "./helpers/events";

/** Inserts an unpublished rubric (with one question) owned by designer1 and returns its ID */
async function createTestRubric(): Promise<string> {
  const testID = "aaaaaaaa-0000-4000-8000-0000000000aa";
  await query(
    `INSERT INTO rubrics (id, designer_id, title, high_score_threshold, low_score_threshold)
     VALUES ($1::uuid, $2, 'Test Rubric', 8, 4)`,
    [testID, IDS.designer1],
  );
  await query(
    `INSERT INTO rubric_questions (rubric_id, section, index, question)
     VALUES ($1::uuid, 1, 1, 'Question 1')`,
    [testID],
  );
  return testID;
}

describeWithDatabase("deleteRubric", () => {
  it("deletes the user's rubric and its questions", async () => {
    const rubricID = await createTestRubric();

    const result = await deleteRubric({ userID: IDS.designer1, rubricID });
    if ("error" in result) throw new Error(result.error);
    expect(result.rubricID).toBe(rubricID);

    const { rows: rubrics } = await query(
      "SELECT 1 FROM rubrics WHERE id = $1",
      [rubricID],
    );
    expect(rubrics).toHaveLength(0);
    const { rows: questions } = await query(
      "SELECT 1 FROM rubric_questions WHERE rubric_id = $1",
      [rubricID],
    );
    expect(questions).toHaveLength(0);
  });

  it("fails on another designer's rubric", async () => {
    const rubricID = await createTestRubric();

    const result = await deleteRubric({ userID: IDS.designer2, rubricID });
    expect(result).toHaveProperty("error");

    // Make sure the rubric was not deleted
    const { rows } = await query("SELECT 1 FROM rubrics WHERE id = $1", [
      rubricID,
    ]);
    expect(rows).toHaveLength(1);
  });

  it("handler returns 404 for another designer's rubric", async () => {
    const rubricID = await createTestRubric();
    const result = await handler(
      buildEvent({ userID: IDS.designer2, pathParameters: { rubricID } }),
    );
    expect(result.statusCode).toBe(404);
  });

  it("handler returns 401 without a logged-in user", async () => {
    const rubricID = await createTestRubric();
    const result = await handler(buildEvent({ pathParameters: { rubricID } }));
    expect(result.statusCode).toBe(401);
  });
});
