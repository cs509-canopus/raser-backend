import { withdrawJournal } from "../lambda/journals/withdraw-journal";
import { query } from "../lambda/db";
import { describeWithDatabase, IDS } from "./db/describe-with-database";

async function createTestJournal() {
  const testID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const { rows } = await query(
    "INSERT INTO journals (id, owner_id, name) " +
      `VALUES ('${testID}', '${IDS.userf}', 'test2') RETURNING *`,
  );
  expect(rows).not.toHaveLength(0);
  return testID;
}

describeWithDatabase("withdrawJournal", () => {
  it("fails on invalid journalID", async () => {
    const testID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const result = await withdrawJournal({ journalID: testID });
    expect(result).toHaveProperty("error");
  })

  it("withdraws empty journal", async () => {
    // Create test journal
    const testID = await createTestJournal();

    // Try removing the test record
    const result = await withdrawJournal({ journalID: testID });

    // Check return value
    if ("error" in result) throw new Error(result.error);
    expect(result.journalID).toBe(testID);

    // Make sure database record was deleted
    const { rows } = await query("SELECT 1 FROM journals WHERE id = $1", [
      testID,
    ]);
    expect(rows).toHaveLength(0);
  });

  it("withdraws journals with issues", async () => {
    // Create test journal
    const journalID = await createTestJournal();

    // Create an issue in the journal
    const issueID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const { rows: rows1 } = await query(
      "INSERT INTO issues (id, journal_id, volume_number, issue_number) " +
        `VALUES ('${issueID}', '${journalID}', 1, 1) RETURNING *`,
    );
    expect(rows1).not.toHaveLength(0);

    // Try removing the test record
    const result = await withdrawJournal({ journalID: journalID });

    // Check return value
    if ("error" in result) throw new Error(result.error);
    expect(result.journalID).toBe(journalID);

    // Make sure journal was deleted
    const { rows: rows2 } = await query(
      "SELECT 1 FROM journals WHERE id = $1::uuid",
      [journalID],
    );
    expect(rows2).toHaveLength(0);

    // Make sure issue was deleted
    const { rows: rows3 } = await query(
      "SELECT 1 FROM issues WHERE journal_id = $1::uuid",
      [journalID],
    );
    expect(rows3).toHaveLength(0);
  });

  it("withdraws journals with issues and papers and reviews", async () => {
    // Test deleting journal1, which has 2 issues and 2 papers
    const result = await withdrawJournal({ journalID: IDS.journal1 });

    // Check return value
    if ("error" in result) throw new Error(result.error);
    expect(result.journalID).toBe(IDS.journal1);

    // Make sure journal was deleted
    const { rows: rows1 } = await query(
      "SELECT 1 FROM journals WHERE id = $1::uuid",
      [IDS.journal1],
    );
    expect(rows1).toHaveLength(0);

    // Make sure issues were deleted
    const { rows: rows2 } = await query(
      "SELECT 1 FROM issues WHERE journal_id = $1::uuid",
      [IDS.journal1],
    );
    expect(rows2).toHaveLength(0);

    // Make sure papers were deleted
    const { rows: rows3 } = await query(
      `SELECT 1 FROM papers 
       JOIN issues ON papers.issue_id = issues.id
       WHERE issues.journal_id = $1::uuid`,
      [IDS.journal1],
    );
    expect(rows3).toHaveLength(0);

    // Make sure reviews where deleted
    const { rows: rows4 } = await query(
      `SELECT 1 FROM reviews
       JOIN papers on reviews.paper_id = papers.id
       JOIN issues ON papers.issue_id = issues.id
       WHERE issues.journal_id = $1::uuid`,
      [IDS.journal1],
    );
    expect(rows4).toHaveLength(0);
  });
});
