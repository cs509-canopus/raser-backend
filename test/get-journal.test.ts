import { getJournal, handler } from "../lambda/journals/get-journal";
import { describeWithDatabase, IDS } from "./db/describe-with-database";
import { buildEvent } from "./helpers/events";

describeWithDatabase("getJournal", () => {
  it("returns the journal to its owner", async () => {
    const result = await getJournal({
      userID: IDS.editor1,
      journalID: IDS.journal1,
    });
    if ("error" in result) throw new Error(result.error);

    expect(result).toMatchObject({
      journalID: IDS.journal1,
      name: "Journal of Plant Cell Culture",
    });
    expect(result.issues).toHaveLength(2);
  });

  it("fails when the journal belongs to another user", async () => {
    const result = await getJournal({
      userID: IDS.editor2,
      journalID: IDS.journal1,
    });
    expect(result).toHaveProperty("error");
  });

  it("handler returns 400 for another user's journal", async () => {
    const result = await handler(
      buildEvent({
        userID: IDS.editor2,
        pathParameters: { journalID: IDS.journal1 },
      }),
    );
    expect(result.statusCode).toBe(400);
  });

  it("handler returns 401 without a logged-in user", async () => {
    const result = await handler(
      buildEvent({ pathParameters: { journalID: IDS.journal1 } }),
    );
    expect(result.statusCode).toBe(401);
  });
});
