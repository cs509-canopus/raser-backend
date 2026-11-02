
import { createRubric, handler } from "../lambda/rubrics/create-rubric";
import { query } from "../lambda/db";
import { DatabaseError } from "pg";
import type { APIGatewayProxyEvent } from "aws-lambda";

jest.mock("../lambda/db", () => ({
  query: jest.fn(),
}));

const mockQuery = jest.mocked(query);

const rubricID = "11111111-1111-1111-1111-111111111111";

const publicationDate = new Date("2025-01-15T12:00:00Z");

const mockRubric = {
  id: rubricID,
  title: "Test Rubric",
  high_quality_threshold: 90,
  low_quality_threshold: 60,
  publication_date: publicationDate,
};

const validBody = {
  name: "Test Rubric",
  highQualityThreshold: 90,
  lowQualityThreshold: 60,
};

const createEvent = (body: string | null) =>
  ({
    body,
  }) as APIGatewayProxyEvent;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("createRubric", () => {
  it("should successfully create a rubric", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [mockRubric],
      rowCount: 1,
    } as never);

    const result = await createRubric({
      title: "Test Rubric",
      highQualityThreshold: 90,
      lowQualityThreshold: 60,
    });

    expect(result).toEqual({
      rubricID,
      title: "Test Rubric",
      questions: [],
      highQualityThreshold: 90,
      lowQualityThreshold: 60,
      score: 0,
      publicationDate: publicationDate.toISOString(),
      deprecationDate: null,
    });
  });

  it("should pass the correct values to the database", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [mockRubric],
      rowCount: 1,
    } as never);

    await createRubric({
      title: "Test Rubric",
      highQualityThreshold: 90,
      lowQualityThreshold: 60,
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO rubrics"),
      ["Test Rubric", 90, 60],
    );
  });

  it("should return an error if the rubric was not created", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
    } as never);

    const result = await createRubric({
      title: "Test Rubric",
      highQualityThreshold: 90,
      lowQualityThreshold: 60,
    });

    expect(result).toEqual({
      error: "Could not create rubric",
    });
  });

  it("should return an error if a duplicate rubric exists", async () => {
    const duplicateError = new DatabaseError(
      "Duplicate rubric",
      0,
      "error",
    );

    duplicateError.code = "23505";

    mockQuery.mockRejectedValueOnce(duplicateError);

    const result = await createRubric({
      title: "Test Rubric",
      highQualityThreshold: 90,
      lowQualityThreshold: 60,
    });

    expect(result).toEqual({
      error: "Rubric with name Test Rubric already exists",
    });
  });

  it("should return an error if the database query fails", async () => {
    mockQuery.mockRejectedValueOnce(
      new Error("Database connection failed"),
    );

    const result = await createRubric({
      title: "Test Rubric",
      highQualityThreshold: 90,
      lowQualityThreshold: 60,
    });

    expect(result).toEqual({
      error: "Failed to create rubric",
    });
  });
});

describe("createRubric handler", () => {
  it("should return 201 when a rubric is successfully created", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [mockRubric],
      rowCount: 1,
    } as never);

    const result = await handler(
      createEvent(JSON.stringify(validBody)),
    );

    expect(result.statusCode).toBe(201);

    expect(JSON.parse(result.body)).toEqual({
      rubricID,
      title: "Test Rubric",
      questions: [],
      highQualityThreshold: 90,
      lowQualityThreshold: 60,
      score: 0,
      publicationDate: publicationDate.toISOString(),
      deprecationDate: null,
    });
  });

  it("should return 400 if the name is missing", async () => {
    const result = await handler(
      createEvent(
        JSON.stringify({
          highQualityThreshold: 90,
          lowQualityThreshold: 60,
        }),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      error: "Missing body parameter: name",
    });

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("should return 400 if the high quality threshold is missing", async () => {
    const result = await handler(
      createEvent(
        JSON.stringify({
          name: "Test Rubric",
          lowQualityThreshold: 60,
        }),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      error: "Missing body parameter: highQualityThreshold",
    });
  });

  it("should return 400 if the low quality threshold is missing", async () => {
    const result = await handler(
      createEvent(
        JSON.stringify({
          name: "Test Rubric",
          highQualityThreshold: 90,
        }),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      error: "Missing body parameter: lowQualityThreshold",
    });
  });

  it("should return 400 if the name is empty", async () => {
    const result = await handler(
      createEvent(
        JSON.stringify({
          ...validBody,
          name: "   ",
        }),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      error: "name must be a non-empty string",
    });
  });

  it("should return 400 if the name is not a string", async () => {
    const result = await handler(
      createEvent(
        JSON.stringify({
          ...validBody,
          name: 123,
        }),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      error: "name must be a non-empty string",
    });
  });

  it("should return 400 if thresholds are not numbers", async () => {
    const result = await handler(
      createEvent(
        JSON.stringify({
          ...validBody,
          highQualityThreshold: "90",
        }),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      error:
        "highQualityThreshold and lowQualityThreshold must be numbers",
    });
  });

  it("should return 400 if thresholds are not finite numbers", async () => {
    const result = await handler(
      createEvent(
        JSON.stringify({
          ...validBody,
          highQualityThreshold: null,
        }),
      ),
    );

    // null fails the number type check
    expect(result.statusCode).toBe(400);
  });

  it("should return 400 if thresholds are below 0", async () => {
    const result = await handler(
      createEvent(
        JSON.stringify({
          ...validBody,
          lowQualityThreshold: -1,
        }),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      error: "Thresholds must be between 0 and 100",
    });
  });

  it("should return 400 if thresholds are above 100", async () => {
    const result = await handler(
      createEvent(
        JSON.stringify({
          ...validBody,
          highQualityThreshold: 101,
        }),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      error: "Thresholds must be between 0 and 100",
    });
  });

  it("should return 400 if the low threshold equals the high threshold", async () => {
    const result = await handler(
      createEvent(
        JSON.stringify({
          ...validBody,
          lowQualityThreshold: 90,
          highQualityThreshold: 90,
        }),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      error:
        "lowQualityThreshold must be less than highQualityThreshold",
    });
  });

  it("should return 400 if the low threshold is greater than the high threshold", async () => {
    const result = await handler(
      createEvent(
        JSON.stringify({
          ...validBody,
          lowQualityThreshold: 95,
          highQualityThreshold: 90,
        }),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      error:
        "lowQualityThreshold must be less than highQualityThreshold",
    });
  });

  it("should trim whitespace from the rubric name", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [mockRubric],
      rowCount: 1,
    } as never);

    const result = await handler(
      createEvent(
        JSON.stringify({
          ...validBody,
          name: "  Test Rubric  ",
        }),
      ),
    );

    expect(result.statusCode).toBe(201);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      ["Test Rubric", 90, 60],
    );
  });

  it("should return 400 if rubric creation fails", async () => {
    mockQuery.mockRejectedValueOnce(
      new Error("Database connection failed"),
    );

    const result = await handler(
      createEvent(JSON.stringify(validBody)),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      error: "Failed to create rubric",
    });
  });
});


