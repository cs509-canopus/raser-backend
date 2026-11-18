import { listRubrics, handler } from "../lambda/rubrics/list-rubrics";
import { query } from "../lambda/db";
import { describeWithDatabase, IDS } from "./db/describe-with-database";
import { readFileSync } from "fs";
import { join } from "path";

const UNPUBLISHED_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

/**
 * Inserts an unpublished rubric owned by designer1 and returns its ID.
 */
async function createUnpublishedRubric(): Promise<string> {
  const { rows } = await query(
    `INSERT INTO rubrics (id, designer_id, title, high_score_threshold, low_score_threshold)
     VALUES ($1::uuid, $2::uuid, 'Unpublished Rubric', 8, 4) RETURNING *`,
    [UNPUBLISHED_ID, IDS.designer1],
  );
  expect(rows).toHaveLength(1);
  return UNPUBLISHED_ID;
}

/**
 * Lists the rubrics visible to `userID` (no filters) and returns their IDs, sorted
 */
async function listRubricIDs(userID: string): Promise<string[]> {
  const result = await listRubrics({ userID });
  if ("error" in result) throw new Error(result.error);
  return result.rubrics.map((rubric) => rubric.id).sort();
}

describeWithDatabase("listRubrics", () => {
  it("returns all rubrics visible to designer1", async () => {
    // Get all rubrics visible to designer1
    const result = await listRubrics({
      userID: IDS.designer1,
    });
    if ("error" in result) throw new Error(result.error);

    // Should not have all filter fields (which were not passed)
    expect(result).not.toHaveProperty("deprecated");
    expect(result).not.toHaveProperty("publishedAfter");
    expect(result).not.toHaveProperty("publishedBefore");

    const rubrics = result.rubrics;

    // designer1 owns rubric1 and can see rubric2 (published by designer2)
    expect(rubrics).toHaveLength(2);
    expect(rubrics.map((rubric) => rubric.id).sort()).toEqual(
      [IDS.rubric1, IDS.rubric2].sort(),
    );

    // Check against fields of rubric1
    const row = rubrics.find((rubric) => rubric.id === IDS.rubric1)!;
    expect(row.id).toBe(IDS.rubric1);
    expect(row.title).toBe("In Vitro Plant Culture Rubric");
    expect(row.highQualityThreshold).toBe(40);
    expect(row.lowQualityThreshold).toBe(25);
    expect(row.questionCount).toBe(10);
  });

  it("returns no rubrics published after 2026-02-01 owned by designer1", async () => {
    const result = await listRubrics({
      userID: IDS.designer1,
      filters: {
        publishedAfter: new Date("2026-02-01"),
      },
    });
    if ("error" in result) throw new Error(result.error);

    // Should not have the filter fields which were not passed
    expect(result).not.toHaveProperty("deprecated");
    expect(result).not.toHaveProperty("publishedBefore");

    const rubrics = result.rubrics;

    // Should be no rubrics (rubric1 was published on 2026-01-10)
    expect(rubrics).toHaveLength(0);
  });

  it("returns no rubrics published before 2025-01-01 owned by designer1", async () => {
    const result = await listRubrics({
      userID: IDS.designer1,
      filters: {
        publishedBefore: new Date("2025-01-01"),
      },
    });
    if ("error" in result) throw new Error(result.error);

    // Should not have the filter fields which were not passed
    expect(result).not.toHaveProperty("deprecated");
    expect(result).not.toHaveProperty("publishedAfter");

    const rubrics = result.rubrics;

    // Should be no rubrics (rubric1 was published on 2026-01-10)
    expect(rubrics).toHaveLength(0);
  });

  it("returns no deprecated rubrics owned by designer1", async () => {
    const result = await listRubrics({
      userID: IDS.designer1,
      filters: {
        deprecated: true,
      },
    });
    if ("error" in result) throw new Error(result.error);

    // Should not have the filter fields which were not passed
    expect(result).not.toHaveProperty("publishedAfter");
    expect(result).not.toHaveProperty("publishedBefore");

    const rubrics = result.rubrics;

    // Should be no rubrics (rubric1 is not deprecated)
    expect(rubrics).toHaveLength(0);
  });

  it("returns non-deprecated rubrics published between 2025-01-01 and 2027-01-01 visible to designer2", async () => {
    const publishedAfter = new Date("2025-01-01");
    const publishedBefore = new Date("2027-01-01");

    const result = await listRubrics({
      userID: IDS.designer2,
      filters: {
        deprecated: false,
        publishedAfter,
        publishedBefore,
      },
    });
    if ("error" in result) throw new Error(result.error);

    // Make sure filters were returned
    expect(result.deprecated).toBe(false);
    expect(result.publishedAfter).toBe(publishedAfter);
    expect(result.publishedBefore).toBe(publishedBefore);

    const rubrics = result.rubrics;

    // Should be 2 rubrics (rubric1 and rubric2, both published on 2026-01-10)
    expect(rubrics).toHaveLength(2);
    expect(rubrics.map((rubric) => rubric.id).sort()).toEqual(
      [IDS.rubric1, IDS.rubric2].sort(),
    );
  });

  it("returns published rubrics owned by other designers", async () => {
    // designer1 owns rubric1, designer2 owns rubric2, both are published
    const ids = await listRubricIDs(IDS.designer1);
    expect(ids).toEqual([IDS.rubric1, IDS.rubric2].sort());
  });

  it("returns unpublished rubrics owned by yourself", async () => {
    const unpublishedID = await createUnpublishedRubric();

    // designer1 should see their own unpublished rubric as well as both published ones
    const ids = await listRubricIDs(IDS.designer1);
    expect(ids).toEqual([IDS.rubric1, IDS.rubric2, unpublishedID].sort());
  });

  it("does not return unpublished rubrics owned by other designers", async () => {
    const unpublishedID = await createUnpublishedRubric();

    // designer2 should only see the published rubrics
    const ids = await listRubricIDs(IDS.designer2);
    expect(ids).not.toContain(unpublishedID);
    expect(ids).toEqual([IDS.rubric1, IDS.rubric2].sort());
  });

  it("returns only published rubrics to a user who owns no rubrics", async () => {
    const unpublishedID = await createUnpublishedRubric();

    // userf owns no rubrics, so should only see the published ones
    const ids = await listRubricIDs(IDS.userf);
    expect(ids).not.toContain(unpublishedID);
    expect(ids).toEqual([IDS.rubric1, IDS.rubric2].sort());
  });

  it("returns deprecated published rubrics owned by other designers", async () => {
    // Deprecate rubric1 (owned by designer1) directly in the database
    await query(
      "UPDATE rubrics SET replaced_by_id = $1::uuid WHERE id = $2::uuid",
      [IDS.rubric2, IDS.rubric1],
    );

    // designer2 should still see rubric1, since it is published
    const ids = await listRubricIDs(IDS.designer2);
    expect(ids).toEqual([IDS.rubric1, IDS.rubric2].sort());
  });

  it("lists all rubrics owned by designer1 with the handler", async () => {
    // Parse event JSON
    const event = JSON.parse(
      readFileSync(
        join(__dirname, "events", "ListRubrics", "list-rubrics.event.jsonc"),
        "utf-8",
      ),
    );

    // Parse response json
    const expected = JSON.parse(
      readFileSync(
        join(__dirname, "events", "ListRubrics", "list-rubrics.expected.jsonc"),
        "utf-8",
      ),
    );

    // Validate response status and body
    const result = await handler(event);
    expect(result.statusCode).toBe(expected.statusCode);
    expect(JSON.parse(result.body)).toEqual(JSON.parse(expected.body));
  });
});
