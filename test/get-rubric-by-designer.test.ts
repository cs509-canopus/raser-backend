import {
  listUserRubrics,
} from "../lambda/rubrics/get-rubric-by-designer";
import { query } from "../lambda/db";

jest.mock("../lambda/db", () => ({
  query: jest.fn(),
}));

const mockQuery = jest.mocked(query);

describe("getRubricByDesigner", () => {
  const rubricID = "11111111-1111-1111-1111-111111111111";
  const userID = "22222222-2222-2222-2222-222222222222";
  const title = "Test Rubric 1";
  const highQualityThreshold = 70;
  const lowQualityThreshold = 20;

  const publicationDate = new Date("2025-01-15T12:00:00Z");
  const createdAt = new Date("2025-01-15T12:00:00Z");

  const mockRubric = {
    id: rubricID,
    designer_id: userID,
    title: title,
    high_score_threshold: highQualityThreshold,
    low_score_threshold: lowQualityThreshold,
    publication_date: publicationDate,
    is_favorite: false,
    replaced_by_id: null,
    created_at: createdAt,
    question_count: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return the rubric owned by designer of designerID", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [mockRubric],
      rowCount: 1,
    } as never);

    const result = await listUserRubrics({ userID });

    expect(result).toEqual([
      {
        rubricID,
        designerID: userID,
        title: "Test Rubric 1",
        highQualityThreshold: 70,
        lowQualityThreshold: 20,
        publicationDate,
        isFavorite: false,
        replacedByID: null,
        createdAt,
        questionCount: 0,
      },
    ]);

    expect(mockQuery).toHaveBeenCalledTimes(1);

    // verify rubric query and user authorization
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("FROM rubrics"),
      [userID],
    );
  });
});
