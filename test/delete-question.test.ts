
<<<<<<< HEAD
=======
import { deleteQuestionCore } from "../lambda/questions/delete-question";
import type { QueryFn } from "../lambda/questions/shared/types";

describe("deleteQuestionCore", () => {
  const rubricID = "123e4567-e89b-12d3-a456-426614174000";

  const mockQuestion = {
    rubric_id: rubricID,
    section: 1,
    index: 0,
    question: "What is photosynthesis?",
    score_explanations: JSON.stringify([
      "Excellent",
      "Very good",
      "Good",
      "Needs improvement",
      "Poor",
    ]),
  };

  let mockQuery: jest.Mock;
  let query: QueryFn;

  beforeEach(() => {
    mockQuery = jest.fn();
    query = mockQuery as unknown as QueryFn;
  });

  test("successfully deletes a question", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: rubricID }],
      })
      .mockResolvedValueOnce({
        rows: [mockQuestion],
      });

    const result = await deleteQuestionCore(
      rubricID,
      "1",
      "0",
      query,
    );

    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({
      rubricID,
      section: 1,
      index: 0,
      question: "What is photosynthesis?",
      scoreExplanations: [
        "Excellent",
        "Very good",
        "Good",
        "Needs improvement",
        "Poor",
      ],
    });

    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  test("returns 400 if rubricID is missing", async () => {
    const result = await deleteQuestionCore(
      undefined,
      "1",
      "0",
      query,
    );

    expect(result.statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 400 if section is missing", async () => {
    const result = await deleteQuestionCore(
      rubricID,
      undefined,
      "0",
      query,
    );

    expect(result.statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 400 if index is missing", async () => {
    const result = await deleteQuestionCore(
      rubricID,
      "1",
      undefined,
      query,
    );

    expect(result.statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 400 if section is invalid", async () => {
    const result = await deleteQuestionCore(
      rubricID,
      "invalid",
      "0",
      query,
    );

    expect(result.statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 400 if index is invalid", async () => {
    const result = await deleteQuestionCore(
      rubricID,
      "1",
      "-1",
      query,
    );

    expect(result.statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 404 if rubric does not exist", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    const result = await deleteQuestionCore(
      rubricID,
      "1",
      "0",
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

    const result = await deleteQuestionCore(
      rubricID,
      "1",
      "0",
      query,
    );

    expect(result.statusCode).toBe(404);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  test("returns 500 if database deletion fails", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: rubricID }],
      })
      .mockRejectedValueOnce(
        new Error("Database deletion failed"),
      );

    const result = await deleteQuestionCore(
      rubricID,
      "1",
      "0",
      query,
    );

    expect(result.statusCode).toBe(500);
    expect(result.body).toHaveProperty("error");
  });
});
>>>>>>> f7e44569cc1e1312723c58e88d01225bc2646774
