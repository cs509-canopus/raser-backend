// Runs the papers queries against the test database to check the ownership filters
import {
  getPaperById,
  getPaperViewInfo,
  journalIdForIssue,
} from "../../lambda/papers/shared/papers-repo";
import { query } from "../../lambda/db";
import { describeWithDatabase, IDS } from "../db/describe-with-database";

describeWithDatabase("papers-repo", () => {
  it("journalIdForIssue only finds issues in the user's journals", async () => {
    expect(
      await journalIdForIssue(query, IDS.journal1Issue1, IDS.editor1),
    ).toBe(IDS.journal1);
    expect(
      await journalIdForIssue(query, IDS.journal1Issue1, IDS.editor2),
    ).toBeNull();
  });

  it("getPaperById only finds papers in the user's journals", async () => {
    const paper = await getPaperById(
      query,
      IDS.journal1Issue1Paper1,
      IDS.editor1,
    );
    expect(paper?.id).toBe(IDS.journal1Issue1Paper1);
    expect(
      await getPaperById(query, IDS.journal1Issue1Paper1, IDS.editor2),
    ).toBeNull();
  });

  it("getPaperViewInfo only finds papers in the user's journals", async () => {
    const info = await getPaperViewInfo(
      query,
      IDS.journal2Issue1Paper1,
      IDS.editor2,
    );
    expect(info).toMatchObject({
      journalId: IDS.journal2,
      issueId: IDS.journal2Issue1,
    });
    expect(
      await getPaperViewInfo(query, IDS.journal2Issue1Paper1, IDS.editor1),
    ).toBeNull();
  });
});
