import { getRubric, handler } from "../lambda/rubrics/get-rubrics";
import { query } from "../lambda/db";
import type { APIGatewayProxyEvent } from "aws-lambda";

jest.mock("../lambda/db", () => ({
  query: jest.fn(),
}));

const mockQuery = jest.mocked(query);

describe("getRubric", () => {
  const rubricID = "11111111-1111-1111-1111-111111111111";
  const userID = "22222222-2222-2222-2222-222222222222";
  const replacementRubricID = "33333333-3333-3333-3333-333333333333";

  const createdAt = new Date("2025-01-01T12:00:00Z");
  const publicationDate = new Date("2025-01-15T12:00:00Z");

  const mockRubric = {
    id: rubricID,
    designer_id: userID,
    title: "Test Rubric",
    high_score_threshold: 90,
    low_score_threshold: 60,
    publication_date: publicationDate,
    is_favorite: true,
    replaced_by_id: null,
    created_at: createdAt,
  };

  const mockQuestions = [
    {
      section: 1,
      index: 1,
      question: "How clear is the response?",
      score_explanations: "Evaluates response clarity",
    },
    {
      section: 1,
      index: 2,
      question: "Is the response accurate?",
      score_explanations: "Evaluates factual accuracy",
    },
    {
      section: 2,
      index: 1,
      question: "Is the response complete?",
      score_explanations: "Evaluates response completeness",
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should successfully get a rubric with questions", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [mockRubric],
        rowCount: 1,
      } as never)
      .mockResolvedValueOnce({
        rows: mockQuestions,
        rowCount: 3,
      } as never);

    const result = await getRubric({ rubricID, userID });

    expect(result).toEqual({
      rubricID,
      designerID: userID,
      title: "Test Rubric",
      questions: [
        {
          section: 1,
          index: 1,
          question: "How clear is the response?",
          scoreExplanations: "Evaluates response clarity",
        },
        {
          section: 1,
          index: 2,
          question: "Is the response accurate?",
          scoreExplanations: "Evaluates factual accuracy",
        },
        {
          section: 2,
          index: 1,
          question: "Is the response complete?",
          scoreExplanations: "Evaluates response completeness",
        },
      ],
      highQualityThreshold: 90,
      lowQualityThreshold: 60,
      publicationDate,
      isFavorite: true,
      replacedByID: null,
      createdAt,
    });

    expect(mockQuery).toHaveBeenCalledTimes(2);

    // Verify rubric query and user authorization
    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("FROM rubrics"),
      [rubricID, userID],
    );

    // Verify questions query
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("FROM rubric_questions"),
      [rubricID],
    );
  });

  it("should successfully get a rubric with no questions", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [mockRubric],
        rowCount: 1,
      } as never)
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as never);

    const result = await getRubric({ rubricID, userID });

    expect(result).toMatchObject({
      rubricID,
      designerID: userID,
      title: "Test Rubric",
      questions: [],
    });

    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("should return an error if the rubric does not exist", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
    } as never);

    const result = await getRubric({ rubricID, userID });

    expect(result).toEqual({
      error: `Could not get rubric with ID ${rubricID}`,
    });

    // Questions should not be queried
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("should return an error if the rubric belongs to another designer", async () => {
    const anotherUserID =
      "44444444-4444-4444-4444-444444444444";

    mockQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
    } as never);

    const result = await getRubric({
      rubricID,
      userID: anotherUserID,
    });

    expect(result).toEqual({
      error: `Could not get rubric with ID ${rubricID}`,
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("designer_id = $2::uuid"),
      [rubricID, anotherUserID],
    );

    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("should successfully get a rubric with null publication date", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            ...mockRubric,
            publication_date: null,
          },
        ],
        rowCount: 1,
      } as never)
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as never);

    const result = await getRubric({ rubricID, userID });

    expect(result).toMatchObject({
      rubricID,
      publicationDate: null,
    });
  });

  it("should successfully get a deprecated rubric with a replacement ID", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            ...mockRubric,
            replaced_by_id: replacementRubricID,
          },
        ],
        rowCount: 1,
      } as never)
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as never);

    const result = await getRubric({ rubricID, userID });

    expect(result).toMatchObject({
      rubricID,
      replacedByID: replacementRubricID,
    });
  });

  it("should successfully get an active rubric with no replacement ID", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [mockRubric],
        rowCount: 1,
      } as never)
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as never);

    const result = await getRubric({ rubricID, userID });

    expect(result).toMatchObject({
      rubricID,
      replacedByID: null,
    });
  });

  it("should correctly map questions with null values", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [mockRubric],
        rowCount: 1,
      } as never)
      .mockResolvedValueOnce({
        rows: [
          {
            section: 1,
            index: 1,
            question: null,
            score_explanations: null,
          },
        ],
        rowCount: 1,
      } as never);

    const result = await getRubric({ rubricID, userID });

    expect(result).toMatchObject({
      questions: [
        {
          section: 1,
          index: 1,
          question: null,
          scoreExplanations: null,
        },
      ],
    });
  });

  it("should return an error if the rubric database query fails", async () => {
    mockQuery.mockRejectedValueOnce(
      new Error("Database connection failed"),
    );

    const result = await getRubric({ rubricID, userID });

    expect(result).toEqual({
      error: "Failed to get rubric",
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("should return an error if the questions database query fails", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [mockRubric],
        rowCount: 1,
      } as never)
      .mockRejectedValueOnce(
        new Error("Questions query failed"),
      );

    const result = await getRubric({ rubricID, userID });

    expect(result).toEqual({
      error: "Failed to get rubric",
    });

    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});

describe("getRubric handler", () => {
  const rubricID = "11111111-1111-1111-1111-111111111111";
  const userID = "22222222-2222-2222-2222-222222222222";

  const mockRubric = {
    id: rubricID,
    designer_id: userID,
    title: "Test Rubric",
    high_score_threshold: 90,
    low_score_threshold: 60,
    publication_date: null,
    is_favorite: false,
    replaced_by_id: null,
    created_at: new Date("2025-01-01T12:00:00Z"),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createEvent = (
    pathParameters: Record<string, string> | null,
    authorizer: object = {
      claims: { sub: userID },
    },
  ) =>
    ({
      pathParameters,
      requestContext: {
        authorizer,
      },
    }) as unknown as APIGatewayProxyEvent;

  it("should return 400 if rubricID is missing", async () => {
    const event = createEvent({});

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      error: "Missing path parameter: rubricID",
    });

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("should return 400 if authenticated user ID is missing", async () => {
    const event = createEvent(
      { rubricID },
      { claims: {} },
    );

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      error: "Missing authenticated user ID",
    });

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("should return 200 when the rubric is successfully retrieved", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [mockRubric],
        rowCount: 1,
      } as never)
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as never);

    const event = createEvent({ rubricID });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);

    expect(JSON.parse(result.body)).toEqual({
      rubricID,
      designerID: userID,
      title: "Test Rubric",
      questions: [],
      highQualityThreshold: 90,
      lowQualityThreshold: 60,
      publicationDate: null,
      isFavorite: false,
      replacedByID: null,
      createdAt: mockRubric.created_at.toISOString(),
    });
  });

  it("should support the JWT authorizer claims format", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [mockRubric],
        rowCount: 1,
      } as never)
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as never);

    const event = createEvent(
      { rubricID },
      { jwt: { claims: { sub: userID } } },
    );

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("FROM rubrics"),
      [rubricID, userID],
    );
  });

  it("should return 404 if the rubric does not exist", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
    } as never);

    const event = createEvent({ rubricID });

    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({
      error: `Could not get rubric with ID ${rubricID}`,
    });
  });

  it("should return 500 if the database query fails", async () => {
    mockQuery.mockRejectedValueOnce(
      new Error("Database connection failed"),
    );

    const event = createEvent({ rubricID });

    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({
      error: "Failed to get rubric",
    });
  });
});







