import { listJournals, handler } from "../lambda/journals/list-journals";
import { describeWithDatabase, IDS } from "./db/describe-with-database";
import { buildEvent, NEW_USER_ID } from "./helpers/events";

describeWithDatabase("listJournals", () => {
  it("only lists journals owned by the user", async () => {
    const result = await listJournals({ userID: IDS.editor1 });
    if (result.error) throw new Error(result.error);

    expect(result.journals?.map((j) => j.id)).toEqual([IDS.journal1]);
  });

  it("filters the user's journals by the query", async () => {
    const match = await listJournals({ userID: IDS.editor2, query: "mammal" });
    expect(match.journals?.map((j) => j.id)).toEqual([IDS.journal2]);

    // journal1 matches "plant" but belongs to editor1
    const other = await listJournals({ userID: IDS.editor2, query: "plant" });
    expect(other.journals).toEqual([]);
  });

  it("returns an empty list for a user with no journals", async () => {
    const result = await listJournals({ userID: NEW_USER_ID });
    expect(result.journals).toEqual([]);
  });

  it("handler lists the logged-in user's journals", async () => {
    const result = await handler(buildEvent({ userID: IDS.editor2 }));
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.journals.map((j: { id: string }) => j.id)).toEqual([
      IDS.journal2,
    ]);
  });

  it("handler returns 401 without a logged-in user", async () => {
    const result = await handler(buildEvent({}));
    expect(result.statusCode).toBe(401);
  });
});
