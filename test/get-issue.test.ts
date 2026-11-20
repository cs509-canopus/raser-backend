import { getIssue, handler } from "../lambda/issues/get-issue";
import { describeWithDatabase, IDS } from "./db/describe-with-database";
import { buildEvent } from "./helpers/events";

describeWithDatabase("getIssue", () => {
  it("returns the issue to the owner of its journal", async () => {
    const result = await getIssue({
      userID: IDS.editor1,
      issueID: IDS.journal1Issue1,
    });
    if ("error" in result) throw new Error(result.error);

    expect(result).toMatchObject({
      journalID: IDS.journal1,
      issueID: IDS.journal1Issue1,
      volumeNumber: 1,
      issueNumber: 1,
    });
    expect(result.papers).toHaveLength(2);
  });

  it("fails when the issue's journal belongs to another user", async () => {
    const result = await getIssue({
      userID: IDS.editor2,
      issueID: IDS.journal1Issue1,
    });
    expect(result).toHaveProperty("error");
  });

  it("handler returns 401 without a logged-in user", async () => {
    const result = await handler(
      buildEvent({ pathParameters: { issueID: IDS.journal1Issue1 } }),
    );
    expect(result.statusCode).toBe(401);
  });
});
