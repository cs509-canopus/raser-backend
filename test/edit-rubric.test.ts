import { editRubric } from "../lambda/rubrics/edit-rubric";
import { query } from "../lambda/db";

jest.mock("../lambda/db", () => ({
  query: jest.fn(),
}));

const mockQuery = jest.mocked(query);

describe("editRubric", () => {
  const mockRubric = {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Updated Test Rubric",
    low_score_threshold: 60,
    high_score_threshold: 90,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should successfully update all rubric fields", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [mockRubric],
      rowCount: 1,
    } as never);

    const result = await editRubric({
      id: "11111111-1111-1111-1111-111111111111",
      title: "Updated Test Rubric",
      lowQualityThreshold: 60,
      highQualityThreshold: 90,
    });

    expect(result).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      title: "Updated Test Rubric",
      lowQualityThreshold: 60,
      highQualityThreshold: 90,
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE rubrics"),
      ["11111111-1111-1111-1111-111111111111", "Updated Test Rubric", 60, 90],
    );
  });

  it("should successfully update only the rubric name", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [mockRubric],
      rowCount: 1,
    } as never);

    const result = await editRubric({
      id: "11111111-1111-1111-1111-111111111111",
      title: "Updated Test Rubric",
    });

    expect(result).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      title: "Updated Test Rubric",
      lowQualityThreshold: 60,
      highQualityThreshold: 90,
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      ["11111111-1111-1111-1111-111111111111", "Updated Test Rubric", null, null],
    );
  });

  it("should successfully update only the low quality threshold", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [mockRubric],
      rowCount: 1,
    } as never);

    const result = await editRubric({
      id: "11111111-1111-1111-1111-111111111111",
      lowQualityThreshold: 50,
    });

    expect(result).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      title: "Updated Test Rubric",
      lowQualityThreshold: 60,
      highQualityThreshold: 90,
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      ["11111111-1111-1111-1111-111111111111", null, 50, null],
    );
  });

  it("should successfully update only the high quality threshold", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [mockRubric],
      rowCount: 1,
    } as never);

    const result = await editRubric({
      id: "11111111-1111-1111-1111-111111111111",
      highQualityThreshold: 95,
    });

    expect(result).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      title: "Updated Test Rubric",
      lowQualityThreshold: 60,
      highQualityThreshold: 90,
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      ["11111111-1111-1111-1111-111111111111", null, null, 95],
    );
  });

  it("should return an error if no fields are provided", async () => {
    const result = await editRubric({ id: "11111111-1111-1111-1111-111111111111" });

    expect(result).toEqual({
      error: "No fields provided to update",
    });

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("should return an error if the title of the rubric is empty", async () => {
    const result = await editRubric({
      id: "11111111-1111-1111-1111-111111111111",
      title: "   ",
    });

    expect(result).toEqual({
      error: "title cannot be empty",
    });

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("should return an error if the low quality threshold is below 0", async () => {
    const result = await editRubric({
      id: "11111111-1111-1111-1111-111111111111",
      lowQualityThreshold: -1,
    });

    expect(result).toEqual({
      error: "lowQualityThreshold must be between 0 and 100",
    });

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("should return an error if the low quality threshold is above 100", async () => {
    const result = await editRubric({
      id: "11111111-1111-1111-1111-111111111111",
      lowQualityThreshold: 101,
    });

    expect(result).toEqual({
      error: "lowQualityThreshold must be between 0 and 100",
    });

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("should return an error if the high quality threshold is below 0", async () => {
    const result = await editRubric({
      id: "11111111-1111-1111-1111-111111111111",
      highQualityThreshold: -1,
    });

    expect(result).toEqual({
      error: "highQualityThreshold must be between 0 and 100",
    });

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("should return an error if the high quality threshold is above 100", async () => {
    const result = await editRubric({
      id: "11111111-1111-1111-1111-111111111111",
      highQualityThreshold: 101,
    });

    expect(result).toEqual({
      error: "highQualityThreshold must be between 0 and 100",
    });

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("should return an error if the low threshold equals the high threshold", async () => {
    const result = await editRubric({
      id: "11111111-1111-1111-1111-111111111111",
      lowQualityThreshold: 80,
      highQualityThreshold: 80,
    });

    expect(result).toEqual({
      error: "lowQualityThreshold must be lower than highQualityThreshold",
    });

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("should return an error if the low threshold is greater than the high threshold", async () => {
    const result = await editRubric({
      id: "11111111-1111-1111-1111-111111111111",
      lowQualityThreshold: 90,
      highQualityThreshold: 80,
    });

    expect(result).toEqual({
      error: "lowQualityThreshold must be lower than highQualityThreshold",
    });

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("should return an error if the rubric does not exist", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
    } as never);

    const result = await editRubric({
      id: "11111111-1111-1111-1111-111111111111",
      title: "Updated Test Rubric",
    });

    expect(result).toEqual({
      error: `Could not find rubric with ID ${"11111111-1111-1111-1111-111111111111"}`,
    });
  });

  it("should return an error if the database query fails", async () => {
    mockQuery.mockRejectedValueOnce(
      new Error("Database connection failed"),
    );

    const result = await editRubric({
      id: "11111111-1111-1111-1111-111111111111",
      title: "Updated Test Rubric",
    });

    expect(result).toEqual({
      error: "Failed to edit rubric",
    });
  });
});
