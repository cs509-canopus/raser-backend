import type { APIGatewayProxyEvent } from "aws-lambda";
import { handler, createRubricQuestion } from "../lambda/questions/create-question";
import { query } from "../lambda/db";

jest.mock("../db", () => ({
  query: jest.fn(),
}));

const mockQuery = query as jest.Mock;

const rubricID = "ffffffff-ffff-ffff-ffff-ffffffffffff";

const validBody = {
  section: 1,
  question: "Is the answer accurate?",
  scoreExplanations: ["Excellent", "Good", "Poor"],
};

const mockEvent = (
  body: unknown,
  pathParameters = { rubricID },
): APIGatewayProxyEvent =>
  ({
    pathParameters,
    body: JSON.stringify(body),
  }) as APIGatewayProxyEvent;

describe("createRubricQuestion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("successfully creates a rubric question", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: rubricID }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            rubric_id: rubricID,
            section: 1,
            index: 0,
            question: validBody.question,
            score_explanations: JSON.stringify(
              validBody.scoreExplanations,
            ),
          },
        ],
      });

    const response = await handler(mockEvent(validBody));

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body)).toEqual({
      rubricID,
      section: 1,
      index: 0,
      question: validBody.question,
      scoreExplanations: validBody.scoreExplanations,
    });
  });

  test("returns 400 when rubricID is missing", async () => {
    const response = await handler(
      mockEvent(validBody, {}),
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe(
      "Missing path parameter: rubricID",
    );
  });

  test("returns 400 when request body is invalid JSON", async () => {
    const event = {
      pathParameters: { rubricID },
      body: "{invalid json",
    } as APIGatewayProxyEvent;

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe(
      "Invalid JSON body",
    );
  });

  test("returns 400 when section is missing", async () => {
    const response = await handler(
      mockEvent({
        question: validBody.question,
        scoreExplanations: validBody.scoreExplanations,
      }),
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe(
      "Missing body parameter: section",
    );
  });

  test("returns 400 when question is missing", async () => {
    const response = await handler(
      mockEvent({
        section: 1,
        scoreExplanations: validBody.scoreExplanations,
      }),
    );

    expect(response.statusCode).toBe(400);
  });

  test("returns 400 when question is empty", async () => {
    const response = await handler(
      mockEvent({
        ...validBody,
        question: "   ",
      }),
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe(
      "question must be a non-empty string",
    );
  });

  test("returns 400 when section is invalid", async () => {
    const response = await handler(
      mockEvent({
        ...validBody,
        section: -1,
      }),
    );

    expect(response.statusCode).toBe(400);
  });

  test("returns 400 when scoreExplanations is not an array of strings", async () => {
    const response = await handler(
      mockEvent({
        ...validBody,
        scoreExplanations: ["Excellent", 123],
      }),
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe(
      "scoreExplanations must be an array of strings",
    );
  });

  test("returns 404 when rubric does not exist", async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 0,
      rows: [],
    });

    const result = await createRubricQuestion({
      rubricID,
      ...validBody,
    });

    expect(result).toEqual({
      error: `Could not find rubric with ID ${rubricID}`,
    });
  });

  test("returns an error when question cannot be created", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: rubricID }],
      })
      .mockResolvedValueOnce({
        rowCount: 0,
        rows: [],
      });

    const result = await createRubricQuestion({
      rubricID,
      ...validBody,
    });

    expect(result).toEqual({
      error: "Could not create rubric question",
    });
  });

  test("handles database errors", async () => {
    mockQuery.mockRejectedValueOnce(new Error("Database failure"));

    const result = await createRubricQuestion({
      rubricID,
      ...validBody,
    });

    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain(
      "Failed to create rubric question",
    );
  });
});
