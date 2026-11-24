import { deleteIssue, handler } from "../lambda/issues/delete-issue";
import { query } from "../lambda/db";
import { describeWithDatabase, IDS } from "./db/describe-with-database";
import { buildEvent } from "./helpers/events";

describeWithDatabase("deleteIssue", () => {
  it("deletes an empty issue for the owner of its journal", async () => {
    const result = await deleteIssue({
      userID: IDS.editor1,
      issueID: IDS.journal1Issue2,
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.issueID).toBe(IDS.journal1Issue2);

    const { rows } = await query("SELECT 1 FROM issues WHERE id = $1", [
      IDS.journal1Issue2,
    ]);
    expect(rows).toHaveLength(0);
  });

  it("fails when the issue's journal belongs to another user", async () => {
    const result = await deleteIssue({
      userID: IDS.editor2,
      issueID: IDS.journal1Issue2,
    });
    expect(result).toHaveProperty("error");

    // Make sure the issue was not deleted
    const { rows } = await query("SELECT 1 FROM issues WHERE id = $1", [
      IDS.journal1Issue2,
    ]);
    expect(rows).toHaveLength(1);
  });

  it("handler returns 401 without a logged-in user", async () => {
    const result = await handler(
      buildEvent({ pathParameters: { issueID: IDS.journal1Issue2 } }),
    );
    expect(result.statusCode).toBe(401);
  });
});
