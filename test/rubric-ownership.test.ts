// Database tests for the logged-in-user rules on create, get and edit rubric. The other
// tests for these functions mock the database, so these live in their own file.
import { createRubric } from "../lambda/rubrics/create-rubric";
import { getRubric } from "../lambda/rubrics/get-rubrics";
import { editRubric } from "../lambda/rubrics/edit-rubric";
import { query } from "../lambda/db";
import { describeWithDatabase, IDS } from "./db/describe-with-database";
import { NEW_USER_ID } from "./helpers/events";

/** Inserts an unpublished rubric owned by designer1 and returns its ID */
async function createUnpublishedRubric(): Promise<string> {
  const testID = "aaaaaaaa-0000-4000-8000-0000000000aa";
  await query(
    `INSERT INTO rubrics (id, designer_id, title, high_score_threshold, low_score_threshold)
     VALUES ($1::uuid, $2, 'Draft Rubric', 8, 4)`,
    [testID, IDS.designer1],
  );
  return testID;
}

describeWithDatabase("createRubric (logged-in user)", () => {
  it("creates the user rows the first time a new user creates a rubric", async () => {
    const result = await createRubric({
      title: "New Rubric",
      designer: NEW_USER_ID,
      highQualityThreshold: 8,
      lowQualityThreshold: 4,
    });
    if ("error" in result) throw new Error(result.error);

    const { rows } = await query(
      "SELECT designer_id FROM rubrics WHERE id = $1",
      [result.rubricID],
    );
    expect(rows).toEqual([{ designer_id: NEW_USER_ID }]);

    const { rows: designers } = await query(
      "SELECT 1 FROM rubric_designers WHERE id = $1",
      [NEW_USER_ID],
    );
    expect(designers).toHaveLength(1);
  });
});

describeWithDatabase("getRubric (logged-in user)", () => {
  it("returns a published rubric to any user", async () => {
    const result = await getRubric({
      rubricID: IDS.rubric1,
      userID: IDS.designer2,
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.designerID).toBe(IDS.designer1);
  });

  it("returns an unpublished rubric to its designer", async () => {
    const rubricID = await createUnpublishedRubric();
    const result = await getRubric({ rubricID, userID: IDS.designer1 });
    expect(result).not.toHaveProperty("error");
  });

  it("hides an unpublished rubric from other users", async () => {
    const rubricID = await createUnpublishedRubric();
    const result = await getRubric({ rubricID, userID: IDS.designer2 });
    expect(result).toHaveProperty("error");
  });
});

describeWithDatabase("editRubric (logged-in user)", () => {
  it("edits the user's rubric", async () => {
    const result = await editRubric({
      userID: IDS.designer1,
      id: IDS.rubric1,
      title: "Renamed",
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.title).toBe("Renamed");
  });

  it("fails on another designer's rubric, even a published one", async () => {
    const result = await editRubric({
      userID: IDS.designer2,
      id: IDS.rubric1,
      title: "Renamed",
    });
    expect(result).toHaveProperty("error");

    // Make sure the title did not change
    const { rows } = await query("SELECT title FROM rubrics WHERE id = $1", [
      IDS.rubric1,
    ]);
    expect(rows).toEqual([{ title: "In Vitro Plant Culture Rubric" }]);
  });
});
