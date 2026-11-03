import { deleteRubric } from "../lambda/rubrics/delete-rubric";
import { withTransaction } from "../lambda/db";

jest.mock("../lambda/db", () => ({
  withTransaction: jest.fn(),
}));

const mockWithTransaction = jest.mocked(withTransaction);
const mockClientQuery = jest.fn();

describe("deleteRubric", () => {
  const rubricID = "11111111-1111-1111-1111-111111111111";

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock the transaction and provide a mock database client
    mockWithTransaction.mockImplementation(async (callback: any) => {
      return callback({
        query: mockClientQuery,
      });
    });
  });

  it("should successfully delete a rubric and its associated questions", async () => {
    // Mock rubric exists
    mockClientQuery
      .mockResolvedValueOnce({
        rows: [{ id: rubricID }],
        rowCount: 1,
      })
      // Mock deleting associated questions
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 2,
      })
      // Mock deleting the rubric
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      });

    const result = await deleteRubric({ rubricID });

    expect(result).toEqual({
      rubricID,
    });

    // Verify all three database queries were executed
    expect(mockClientQuery).toHaveBeenCalledTimes(3);

    // Verify rubric existence check
    expect(mockClientQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("SELECT id FROM rubrics"),
      [rubricID],
    );

    // Verify associated questions were deleted
    expect(mockClientQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('DELETE FROM "rubricQuestion"'),
      [rubricID],
    );

    // Verify rubric was deleted
    expect(mockClientQuery).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("DELETE FROM rubrics"),
      [rubricID],
    );
  });

  it("should return an error if the rubric does not exist", async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
    });

    const result = await deleteRubric({ rubricID });

    expect(result).toEqual({
      error: `Could not find rubric with ID ${rubricID}`,
    });

    // Should only execute the SELECT query
    expect(mockClientQuery).toHaveBeenCalledTimes(1);
  });

  it("should return an error if deleting the questions fails", async () => {
    mockClientQuery
      .mockResolvedValueOnce({
        rows: [{ id: rubricID }],
        rowCount: 1,
      })
      .mockRejectedValueOnce(new Error("Failed to delete questions"));

    const result = await deleteRubric({ rubricID });

    expect(result).toEqual({
      error: "Failed to delete rubric",
    });

    // The rubric DELETE query should never execute
    expect(mockClientQuery).toHaveBeenCalledTimes(2);
  });

  it("should return an error if deleting the rubric fails", async () => {
    mockClientQuery
      .mockResolvedValueOnce({
        rows: [{ id: rubricID }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 2,
      })
      .mockRejectedValueOnce(new Error("Failed to delete rubric"));

    const result = await deleteRubric({ rubricID });

    expect(result).toEqual({
      error: "Failed to delete rubric",
    });

    expect(mockClientQuery).toHaveBeenCalledTimes(3);
  });

  it("should return an error if the initial database query fails", async () => {
    mockClientQuery.mockRejectedValueOnce(
      new Error("Database connection failed"),
    );

    const result = await deleteRubric({ rubricID });

    expect(result).toEqual({
      error: "Failed to delete rubric",
    });

    expect(mockClientQuery).toHaveBeenCalledTimes(1);
  });
});