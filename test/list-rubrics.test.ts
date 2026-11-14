import { listRubrics, handler } from "../lambda/rubrics/list-rubrics";
import { query } from "../lambda/db";
import { describeWithDatabase, IDS } from "./db/describe-with-database";
import { readFileSync } from "fs";
import { join } from "path";

describeWithDatabase("listRubrics", () => {
  it("returns all rubrics owned by designer1", async () => {
    // Get all rubrics owned by designer1
    const result = await listRubrics({
      userID: IDS.designer1,
    });
    if ("error" in result) throw new Error(result.error);

    // Should not have all filter fields (which were not passed)
    expect(result).not.toHaveProperty("deprecated");
    expect(result).not.toHaveProperty("publishedAfter");
    expect(result).not.toHaveProperty("publishedBefore");

    const rubrics = result.rubrics;

    // Only 1 rubric is owned by designer1
    expect(rubrics).toHaveLength(1);

    // Check against fields of rubric1
    const row = rubrics[0];
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

  it("returns a non-deprecated rubric published between 2025-01-01 and 2027-01-01 owned by designer2", async () => {
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

    // Should be 1 rubric (rubric2)
    expect(rubrics).toHaveLength(1);
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
