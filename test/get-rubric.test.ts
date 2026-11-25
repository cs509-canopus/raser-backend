import { getRubric, handler } from "../lambda/rubrics/get-rubrics";
import { listRubrics } from "../lambda/rubrics/list-rubrics";
import { query } from "../lambda/db";
import { describeWithDatabase, IDS } from "./db/describe-with-database";
import { buildEvent, NEW_USER_ID } from "./helpers/events";

const UNPUBLISHED_ID = "55555555-0000-4000-8000-0000000000aa";
const MISSING_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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
 * Deprecates rubric1 (owned by designer1), replacing it with rubric2.
 */
async function deprecateRubric1(): Promise<void> {
  await query(
    "UPDATE rubrics SET replaced_by_id = $1::uuid WHERE id = $2::uuid",
    [IDS.rubric2, IDS.rubric1],
  );
}

const notFound = (id: string) => ({
  error: `Could not get rubric with ID ${id}`,
});

describeWithDatabase("getRubric", () => {
  it("returns every field and question of a rubric owned by yourself", async () => {
    const result = await getRubric({
      rubricID: IDS.rubric1,
      userID: IDS.designer1,
    });
    if ("error" in result) throw new Error(result.error);

    expect(result).toMatchObject({
      rubricID: IDS.rubric1,
      designerID: IDS.designer1,
      title: "In Vitro Plant Culture Rubric",
      highQualityThreshold: 40,
      lowQualityThreshold: 25,
      publicationDate: new Date("2026-01-10T09:00:00Z"),
      isFavorite: false,
      replacedByID: null,
      createdAt: new Date("2026-01-05T09:00:00Z"),
    });

    // 2 questions in each of the 5 sections, ordered by section then index
    expect(result.questions).toHaveLength(10);
    expect(result.questions.map((q) => [q.section, q.index])).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
      [2, 2],
      [3, 1],
      [3, 2],
      [4, 1],
      [4, 2],
      [5, 1],
      [5, 2],
    ]);
    expect(result.questions[0]).toEqual({
      section: 1,
      index: 1,
      question: "Is key relevant literature cited?",
      scoreExplanations: expect.stringContaining(
        "5 = all key prior work cited",
      ),
    });
  });

  it("returns published rubrics owned by other designers", async () => {
    // rubric2 is published and owned by designer2
    const result = await getRubric({
      rubricID: IDS.rubric2,
      userID: IDS.designer1,
    });
    if ("error" in result) throw new Error(result.error);

    expect(result.rubricID).toBe(IDS.rubric2);
    expect(result.designerID).toBe(IDS.designer2);
    expect(result.questions).toHaveLength(10);
  });

  it("returns published rubrics to a user who owns no rubrics", async () => {
    const result = await getRubric({
      rubricID: IDS.rubric1,
      userID: IDS.userf,
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.rubricID).toBe(IDS.rubric1);
  });

  it("returns deprecated rubrics owned by yourself", async () => {
    await deprecateRubric1();

    const result = await getRubric({
      rubricID: IDS.rubric1,
      userID: IDS.designer1,
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.replacedByID).toBe(IDS.rubric2);
  });

  it("returns deprecated rubrics owned by other designers", async () => {
    await deprecateRubric1();

    const result = await getRubric({
      rubricID: IDS.rubric1,
      userID: IDS.designer2,
    });
    if ("error" in result) throw new Error(result.error);

    expect(result.rubricID).toBe(IDS.rubric1);
    expect(result.designerID).toBe(IDS.designer1);
    expect(result.replacedByID).toBe(IDS.rubric2);
  });

  it("returns unpublished rubrics owned by yourself", async () => {
    const unpublishedID = await createUnpublishedRubric();

    const result = await getRubric({
      rubricID: unpublishedID,
      userID: IDS.designer1,
    });
    if ("error" in result) throw new Error(result.error);

    expect(result).toMatchObject({
      rubricID: unpublishedID,
      designerID: IDS.designer1,
      title: "Unpublished Rubric",
      publicationDate: null,
      replacedByID: null,
      questions: [],
    });
  });

  it("does not return unpublished rubrics owned by other designers", async () => {
    const unpublishedID = await createUnpublishedRubric();

    const result = await getRubric({
      rubricID: unpublishedID,
      userID: IDS.designer2,
    });
    expect(result).toEqual(notFound(unpublishedID));
  });

  it("does not return unpublished rubrics to a user who owns no rubrics", async () => {
    const unpublishedID = await createUnpublishedRubric();

    const result = await getRubric({
      rubricID: unpublishedID,
      userID: IDS.userf,
    });
    expect(result).toEqual(notFound(unpublishedID));
  });

  it("returns an error if the rubric does not exist", async () => {
    const result = await getRubric({
      rubricID: MISSING_ID,
      userID: IDS.designer1,
    });
    expect(result).toEqual(notFound(MISSING_ID));
  });

  it.each([
    ["designer1", IDS.designer1],
    ["designer2", IDS.designer2],
    ["userf", IDS.userf],
    ["a new user", NEW_USER_ID],
  ])(
    "can view exactly the rubrics that listRubrics returns to %s",
    async (_name, userID) => {
      // Mix of owned/unowned, published/unpublished and deprecated rubrics
      await createUnpublishedRubric();
      await deprecateRubric1();

      const listed = await listRubrics({ userID });
      if ("error" in listed) throw new Error(listed.error);
      const listedIDs = new Set(listed.rubrics.map((rubric) => rubric.id));

      for (const rubricID of [IDS.rubric1, IDS.rubric2, UNPUBLISHED_ID]) {
        const result = await getRubric({ rubricID, userID });
        if (listedIDs.has(rubricID)) {
          expect(result).toMatchObject({ rubricID });
        } else {
          expect(result).toEqual(notFound(rubricID));
        }
      }
    },
  );
});

describeWithDatabase("getRubric handler", () => {
  it("returns 200 with a published rubric owned by another designer", async () => {
    const result = await handler(
      buildEvent({
        userID: IDS.designer2,
        pathParameters: { rubricID: IDS.rubric1 },
      }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toMatchObject({
      rubricID: IDS.rubric1,
      designerID: IDS.designer1,
      title: "In Vitro Plant Culture Rubric",
      publicationDate: "2026-01-10T09:00:00.000Z",
      createdAt: "2026-01-05T09:00:00.000Z",
    });
    expect(body.questions).toHaveLength(10);
  });

  it("returns 200 with an unpublished rubric owned by yourself", async () => {
    const unpublishedID = await createUnpublishedRubric();

    const result = await handler(
      buildEvent({
        userID: IDS.designer1,
        pathParameters: { rubricID: unpublishedID },
      }),
    );

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({
      rubricID: unpublishedID,
      publicationDate: null,
    });
  });

  it("returns 404 for an unpublished rubric owned by another designer", async () => {
    const unpublishedID = await createUnpublishedRubric();

    const result = await handler(
      buildEvent({
        userID: IDS.designer2,
        pathParameters: { rubricID: unpublishedID },
      }),
    );

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual(notFound(unpublishedID));
  });

  it("returns 404 if the rubric does not exist", async () => {
    const result = await handler(
      buildEvent({
        userID: IDS.designer1,
        pathParameters: { rubricID: MISSING_ID },
      }),
    );

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual(notFound(MISSING_ID));
  });

  it("returns 400 if rubricID is missing", async () => {
    const result = await handler(
      buildEvent({ userID: IDS.designer1, pathParameters: {} }),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toMatchObject({
      error: "Input error",
      pathErrors: [expect.objectContaining({ field: "rubricID" })],
    });
  });

  it("returns 400 if rubricID is not a UUID", async () => {
    const result = await handler(
      buildEvent({
        userID: IDS.designer1,
        pathParameters: { rubricID: "not-a-uuid" },
      }),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe("Input error");
  });

  it("returns 401 if there is no logged-in user", async () => {
    const result = await handler(
      buildEvent({ pathParameters: { rubricID: IDS.rubric1 } }),
    );

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body)).toEqual({ error: "Unauthorized" });
  });
});
