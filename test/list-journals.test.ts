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

  it("returns coverImage when the journal has a cover image", async () => {
    // journal1 has cover_image set
    const result = await listJournals({ userID: IDS.editor1 });
    if (result.error) throw new Error(result.error);

    expect(result.journals).toHaveLength(1);
    expect(result.journals![0]).toHaveProperty(
      "coverImage",
      "https://plant-journal.example.com/cover.png",
    );
  });

  it("returns coverImage as null when the journal has no cover image", async () => {
    // journal2 has cover_image NULL
    const result = await listJournals({ userID: IDS.editor2 });
    if (result.error) throw new Error(result.error);

    expect(result.journals).toHaveLength(1);
    expect(result.journals![0]).toHaveProperty("coverImage", null);
  });

  it("handler returns coverImage as null when the journal has no cover image", async () => {
    const result = await handler(buildEvent({ userID: IDS.editor2 }));
    expect(result.statusCode).toBe(200);
    const [journal] = JSON.parse(result.body).journals;
    expect(journal).toHaveProperty("coverImage", null);
  });

  it("handler returns coverImage as a URL", async () => {
    const result = await handler(buildEvent({ userID: IDS.editor1 }));
    expect(result.statusCode).toBe(200);
    const [journal] = JSON.parse(result.body).journals;
    expect(journal.coverImage).toBe(
      "https://plant-journal.example.com/cover.png",
    );
    expect(() => new URL(journal.coverImage)).not.toThrow();
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
