<<<<<<< HEAD

=======
import { editQuestionCore } from "../lambda/questions/edit-question";
import type { QueryFn } from "../lambda/questions/shared/types";

describe("editQuestionCore", () => {
  const rubricID = "123e4567-e89b-12d3-a456-426614174000";

  const validBody = {
    question: "What is photosynthesis?",
    scoreExplanations: [
      "Excellent",
      "Very good",
      "Good",
      "Needs improvement",
      "Poor",
    ],
  };

  const rawBody = JSON.stringify(validBody);

  const mockQuestion = {
    rubric_id: rubricID,
    section: 1,
    index: 0,
    question: "What is photosynthesis?",
    score_explanations: JSON.stringify(
      validBody.scoreExplanations,
    ),
  };

  let mockQuery: jest.Mock;
  let query: QueryFn;

  beforeEach(() => {
    mockQuery = jest.fn();
    query = mockQuery as unknown as QueryFn;
  });

  test("successfully edits a question", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: rubricID }],
      })
      .mockResolvedValueOnce({
        rows: [mockQuestion],
      });

    const result = await editQuestionCore(
      rubricID,
      "1",
      "0",
      rawBody,
      query,
    );

    expect(result.statusCode).toBe(200);

    expect(result.body).toEqual({
      rubricID,
      section: 1,
      index: 0,
      question: "What is photosynthesis?",
      scoreExplanations: validBody.scoreExplanations,
    });

    expect(mockQuery).toHaveBeenCalledTimes(2);

    // Verify that the UPDATE query uses the correct parameters
    expect(mockQuery.mock.calls[1][1]).toEqual([
      rubricID,
      1,
      0,
      "What is photosynthesis?",
      JSON.stringify(validBody.scoreExplanations),
    ]);
  });

  test("returns 400 if rubricID is missing", async () => {
    const result = await editQuestionCore(
      undefined,
      "1",
      "0",
      rawBody,
      query,
    );

    expect(result.statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 400 if sectionNumber is missing", async () => {
    const result = await editQuestionCore(
      rubricID,
      undefined,
      "0",
      rawBody,
      query,
    );

    expect(result.statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 400 if index is missing", async () => {
    const result = await editQuestionCore(
      rubricID,
      "1",
      undefined,
      rawBody,
      query,
    );

    expect(result.statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 400 if sectionNumber is invalid", async () => {
    const result = await editQuestionCore(
      rubricID,
      "invalid",
      "0",
      rawBody,
      query,
    );

    expect(result.statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 400 if sectionNumber is zero", async () => {
    const result = await editQuestionCore(
      rubricID,
      "0",
      "0",
      rawBody,
      query,
    );

    expect(result.statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 400 if index is invalid", async () => {
    const result = await editQuestionCore(
      rubricID,
      "1",
      "invalid",
      rawBody,
      query,
    );

    expect(result.statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 400 if index is negative", async () => {
    const result = await editQuestionCore(
      rubricID,
      "1",
      "-1",
      rawBody,
      query,
    );

    expect(result.statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 400 if request body is missing", async () => {
    const result = await editQuestionCore(
      rubricID,
      "1",
      "0",
      null,
      query,
    );

    expect(result.statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 400 if request body is invalid JSON", async () => {
    const result = await editQuestionCore(
      rubricID,
      "1",
      "0",
      "{invalid json",
      query,
    );

    expect(result.statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 400 if question is missing", async () => {
    const result = await editQuestionCore(
      rubricID,
      "1",
      "0",
      JSON.stringify({
        scoreExplanations: validBody.scoreExplanations,
      }),
      query,
    );

    expect(result.statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 400 if scoreExplanations do not contain exactly 5 entries", async () => {
    const result = await editQuestionCore(
      rubricID,
      "1",
      "0",
      JSON.stringify({
        question: "What is photosynthesis?",
        scoreExplanations: ["Excellent", "Good", "Poor"],
      }),
      query,
    );

    expect(result.statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 400 if scoreExplanations contain an empty entry", async () => {
    const result = await editQuestionCore(
      rubricID,
      "1",
      "0",
      JSON.stringify({
        question: "What is photosynthesis?",
        scoreExplanations: [
          "Excellent",
          "Very good",
          "",
          "Needs improvement",
          "Poor",
        ],
      }),
      query,
    );

    expect(result.statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 404 if rubric does not exist", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    const result = await editQuestionCore(
      rubricID,
      "1",
      "0",
      rawBody,
      query,
    );

    expect(result.statusCode).toBe(404);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  test("returns 404 if question does not exist", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: rubricID }],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    const result = await editQuestionCore(
      rubricID,
      "1",
      "0",
      rawBody,
      query,
    );

    expect(result.statusCode).toBe(404);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  test("returns 500 if database update fails", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: rubricID }],
      })
      .mockRejectedValueOnce(
        new Error("Database update failed"),
      );

    const result = await editQuestionCore(
      rubricID,
      "1",
      "0",
      rawBody,
      query,
    );

    expect(result.statusCode).toBe(500);
    expect(result.body).toHaveProperty("error");
  });
});
>>>>>>> f7e44569cc1e1312723c58e88d01225bc2646774
