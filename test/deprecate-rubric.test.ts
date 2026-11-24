import {
  deprecateRubric,
  DeprecateRubricError,
  handler,
} from "../lambda/rubrics/deprecate-rubric";
import { query } from "../lambda/db";
import { describeWithDatabase, IDS } from "./db/describe-with-database";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Inserts a new rubric owned by designer1 and returns its ID.
 * @param published - whether to set a publication date
 */
async function createTestRubric(published: boolean): Promise<string> {
  const testID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const { rows } = await query(
    `INSERT INTO rubrics (id, designer_id, title, high_score_threshold, low_score_threshold, publication_date)
     VALUES ($1::uuid, $2::uuid, 'Test Rubric', 40, 25, $3) RETURNING *`,
    [testID, IDS.designer1, published ? "2026-02-01T09:00:00Z" : null],
  );
  expect(rows).toHaveLength(1);
  return testID;
}

/**
 * Returns the replaced_by_id of the rubric with ID `rubricID`
 */
async function getReplacedByID(rubricID: string): Promise<string | null> {
  const { rows } = await query(
    "SELECT replaced_by_id FROM rubrics WHERE id = $1::uuid",
    [rubricID],
  );
  expect(rows).toHaveLength(1);
  return rows[0].replaced_by_id;
}

describeWithDatabase("deprecateRubric", () => {
  it("fails on non-existant rubric", async () => {
    const invalidRubricID = IDS.userf; // all f's
    const result = await deprecateRubric({
      userID: IDS.designer1,
      rubricID: invalidRubricID,
      replacementID: IDS.rubric2,
    });

    // Make sure it errored
    expect(result).toHaveProperty("error");
    expect((result as DeprecateRubricError).error).toBe(
      `Rubric not found: ${invalidRubricID}`,
    );
  });

  it("fails on non-existant replacement rubic", async () => {
    const invalidRubricID = IDS.userf; // all f's
    const result = await deprecateRubric({
      userID: IDS.designer1,
      rubricID: IDS.rubric1,
      replacementID: invalidRubricID,
    });

    // Make sure it errored
    expect(result).toHaveProperty("error");
    expect((result as DeprecateRubricError).error).toBe(
      `Replacement rubric not found: ${invalidRubricID}`,
    );

    // Make sure the replaced_by_id was not set
    expect(await getReplacedByID(IDS.rubric1)).toBeNull();
  });

  it("fails on rubric not owned by the user", async () => {
    // Try deprecating rubric1 (owned by designer1) while logged-in as designer2
    const result = await deprecateRubric({
      userID: IDS.designer2,
      rubricID: IDS.rubric1,
      replacementID: IDS.rubric2,
    });

    // Make sure it errored
    expect(result).toHaveProperty("error");
    expect((result as DeprecateRubricError).error).toBe(
      `Rubric not found: ${IDS.rubric1}`,
    );

    // Make sure rubric1 was not deprecated
    expect(await getReplacedByID(IDS.rubric1)).toBeNull();
  });

  it("fails on unpublished rubric", async () => {
    // Create an unpublished rubric owned by designer1
    const unpublishedID = await createTestRubric(false);

    const result = await deprecateRubric({
      userID: IDS.designer1,
      rubricID: unpublishedID,
      replacementID: IDS.rubric2,
    });

    // Make sure it errored
    expect(result).toHaveProperty("error");
    expect((result as DeprecateRubricError).error).toBe(
      "Cannot deprecate an unpublished rubric",
    );

    // Make sure the unpublished rubric was not deprecated
    expect(await getReplacedByID(unpublishedID)).toBeNull();
  });

  it("fails on unpublished replacement rubric", async () => {
    // Create an unpublished rubric to use as the replacement
    const unpublishedID = await createTestRubric(false);

    const result = await deprecateRubric({
      userID: IDS.designer1,
      rubricID: IDS.rubric1,
      replacementID: unpublishedID,
    });

    // Make sure it errored
    expect(result).toHaveProperty("error");
    expect((result as DeprecateRubricError).error).toBe(
      `Replacement rubric not found: ${unpublishedID}`,
    );

    // Make sure rubric1 was not deprecated
    expect(await getReplacedByID(IDS.rubric1)).toBeNull();
  });

  it("fails on already deprecated rubric", async () => {
    // Deprecate rubric1 directly in the database (replaced by rubric2)
    await query(
      "UPDATE rubrics SET replaced_by_id = $1::uuid WHERE id = $2::uuid",
      [IDS.rubric2, IDS.rubric1],
    );

    // Create a new published rubric to try replacing rubric1 with
    const newReplacementID = await createTestRubric(true);

    const result = await deprecateRubric({
      userID: IDS.designer1,
      rubricID: IDS.rubric1,
      replacementID: newReplacementID,
    });

    // Make sure it errored
    expect(result).toHaveProperty("error");
    expect((result as DeprecateRubricError).error).toBe(
      "Cannot deprecate an already deprecated rubric",
    );

    // Make sure rubric1 is still replaced by rubric2
    expect(await getReplacedByID(IDS.rubric1)).toBe(IDS.rubric2);
  });

  it("fails when replacing a rubric with itself", async () => {
    // Try replacing rubric1 with rubric1
    const result = await deprecateRubric({
      userID: IDS.designer1,
      rubricID: IDS.rubric1,
      replacementID: IDS.rubric1,
    });

    // Make sure it errored
    expect(result).toHaveProperty("error");
    expect((result as DeprecateRubricError).error).toBe(
      "Cannot replace rubric with itself",
    );

    // Make sure rubric1 was not deprecated
    expect(await getReplacedByID(IDS.rubric1)).toBeNull();
  });

  it("deprecates rubric1 and replaces it with rubric2", async () => {
    const before = new Date();
    const result = await deprecateRubric({
      userID: IDS.designer1,
      rubricID: IDS.rubric1,
      replacementID: IDS.rubric2,
    });

    // Check return value
    if ("error" in result) throw new Error(result.error);
    expect(result.rubricID).toBe(IDS.rubric1);
    expect(result.replacementID).toBe(IDS.rubric2);
    expect(result.deprecationDate).toBeInstanceOf(Date);
    expect(result.deprecationDate.getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    );

    // Make sure rubric1 is now replaced by rubric2 in the database
    expect(await getReplacedByID(IDS.rubric1)).toBe(IDS.rubric2);

    // Make sure rubric2 was not changed
    expect(await getReplacedByID(IDS.rubric2)).toBeNull();
  });

  it("deprecates rubric1 with the handler", async () => {
    // Parse event JSON
    const event = JSON.parse(
      readFileSync(
        join(
          __dirname,
          "events",
          "DeprecateRubric",
          "deprecate-rubric.event.jsonc",
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
          "DeprecateRubric",
          "deprecate-rubric.expected.jsonc",
        ),
        "utf-8",
      ),
    );

    // Validate response status and body
    // (deprecationDate is the current time, so it is checked separately)
    const result = await handler(event);
    expect(result.statusCode).toBe(expected.statusCode);
    const body = JSON.parse(result.body);
    expect(body).toMatchObject(JSON.parse(expected.body));
    expect(Number.isNaN(Date.parse(body.deprecationDate))).toBe(false);

    // Make sure rubric1 was actually deprecated
    expect(await getReplacedByID(event.pathParameters.rubricID)).toBe(
      JSON.parse(event.body).replacementID,
    );
  });
});
