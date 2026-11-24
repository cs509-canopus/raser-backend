import { createIssue, handler } from "../lambda/journals/create-issue";
import { query } from "../lambda/db";
import { describeWithDatabase, IDS } from "./db/describe-with-database";
import { buildEvent } from "./helpers/events";

describeWithDatabase("createIssue", () => {
  it("creates an issue in a journal owned by the user", async () => {
    const result = await createIssue({
      userID: IDS.editor1,
      journalID: IDS.journal1,
      volumeNumber: 2,
      issueNumber: 1,
    });
    if ("error" in result) throw new Error(result.error);

    expect(result).toMatchObject({ volumeNumber: 2, issueNumber: 1 });
    const { rows } = await query(
      "SELECT journal_id FROM issues WHERE id = $1",
      [result.issueID],
    );
    expect(rows).toEqual([{ journal_id: IDS.journal1 }]);
  });

  it("fails when the journal belongs to another user", async () => {
    const result = await createIssue({
      userID: IDS.editor2,
      journalID: IDS.journal1,
      volumeNumber: 2,
      issueNumber: 1,
    });
    expect(result).toHaveProperty("error");

    // Make sure no issue was created
    const { rows } = await query(
      "SELECT 1 FROM issues WHERE journal_id = $1 AND volume_number = 2",
      [IDS.journal1],
    );
    expect(rows).toHaveLength(0);
  });

  it("still reports duplicate issues for the owner", async () => {
    const result = await createIssue({
      userID: IDS.editor1,
      journalID: IDS.journal1,
      volumeNumber: 1,
      issueNumber: 1,
    });
    expect(result).toHaveProperty("error");
  });

  it("handler returns 401 without a logged-in user", async () => {
    const result = await handler(
      buildEvent({
        pathParameters: { journalID: IDS.journal1 },
        body: { volumeNumber: 3, issueNumber: 1 },
      }),
    );
    expect(result.statusCode).toBe(401);
  });
});
