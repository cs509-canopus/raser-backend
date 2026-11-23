import { addQuestionCore } from "../lambda/questions/create-question";
import type { QueryFn } from "../lambda/questions/shared/types";

describe("addQuestionCore", () => {
  const rubricID = "123e4567-e89b-12d3-a456-426614174000";

  const validBody = {
    section: 1,
    question: "How clearly is the research problem defined?",
    scoreExplanations: [
      "No research problem is identified.",
      "The problem is poorly defined.",
      "The problem is somewhat clear.",
      "The problem is clearly defined.",
      "The problem is exceptionally clear and specific.",
    ],
  };

  // Mock database question row
  const mockQuestionRow = {
    rubric_id: rubricID,
    section: 1,
    index: 0,
    question: validBody.question,
    score_explanations: JSON.stringify(
      validBody.scoreExplanations,
    ),
  };

  // Helper to create a mock query function
  function createMockQuery(
    rubricExists: boolean = true,
    insertError: boolean = false,
  ): jest.Mock {
    return jest.fn().mockImplementation(
      async (sql: string) => {
        // First query checks whether rubric exists
        if (sql.includes("SELECT id FROM rubrics")) {
          return {
            rows: rubricExists ? [{ id: rubricID }] : [],
          };
        }

        // Second query inserts the question
        if (sql.includes("INSERT INTO rubric_questions")) {
          if (insertError) {
            throw new Error("Database insertion failed");
          }

          return {
            rows: [mockQuestionRow],
          };
        }

        throw new Error("Unexpected SQL query");
      },
    );
  }

  test("successfully adds a question", async () => {
    const query = createMockQuery();

    const result = await addQuestionCore(
      rubricID,
      JSON.stringify(validBody),
      query as QueryFn,
    );

    expect(result.statusCode).toBe(201);

    expect(result.body).toEqual({
      rubricID,
      section: 1,
      index: 0,
      question: validBody.question,
      scoreExplanations: validBody.scoreExplanations,
    });

    expect(query).toHaveBeenCalledTimes(2);
  });

  test("returns 400 if rubricID is missing", async () => {
    const query = createMockQuery();

    const result = await addQuestionCore(
      undefined,
      JSON.stringify(validBody),
      query as QueryFn,
    );

    expect(result.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  test("returns 400 if request body is invalid JSON", async () => {
    const query = createMockQuery();

    const result = await addQuestionCore(
      rubricID,
      "{invalid json",
      query as QueryFn,
    );

    expect(result.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  test("returns 400 if question is missing", async () => {
    const query = createMockQuery();

    const invalidBody = {
      ...validBody,
      question: "",
    };

    const result = await addQuestionCore(
      rubricID,
      JSON.stringify(invalidBody),
      query as QueryFn,
    );

    expect(result.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  test("returns 400 if score explanations do not contain exactly 5 entries", async () => {
    const query = createMockQuery();

    const invalidBody = {
      ...validBody,
      scoreExplanations: [
        "Score 1",
        "Score 2",
        "Score 3",
      ],
    };

    const result = await addQuestionCore(
      rubricID,
      JSON.stringify(invalidBody),
      query as QueryFn,
    );

    expect(result.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  test("returns 404 if rubric does not exist", async () => {
    const query = createMockQuery(false);

    const result = await addQuestionCore(
      rubricID,
      JSON.stringify(validBody),
      query as QueryFn,
    );

    expect(result.statusCode).toBe(404);
    expect(query).toHaveBeenCalledTimes(1);
  });

  test("returns 500 if database insertion fails", async () => {
    const query = createMockQuery(true, true);

    const result = await addQuestionCore(
      rubricID,
      JSON.stringify(validBody),
      query as QueryFn,
    );

    expect(result.statusCode).toBe(500);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
