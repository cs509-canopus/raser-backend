import { createJournal, handler } from "../lambda/journals/create-journal";
import { query } from "../lambda/db";
import { describeWithDatabase, IDS } from "./db/describe-with-database";
import { buildEvent, NEW_USER_ID } from "./helpers/events";

describeWithDatabase("createJournal", () => {
  it("inserts the journal with just name and returns it", async () => {
    const result = await createJournal({ ownerID: IDS.userf, name: "test1" });
    if ("error" in result) throw new Error(result.error);

    // Make sure return object is correct
    expect(result).toMatchObject({ 
      ownerID: IDS.userf,
      name: "test1", 
      description: null,
      websiteUrl: null,
      coverImageUrl: null,
    });

    // Make sure data was actually inserted
    const { rows } = await query("SELECT name FROM journals WHERE id = $1", [
      result.journalID,
    ]);
    expect(rows).toEqual([{ name: "test1" }]);
  });

  it("creates the user rows the first time a new user creates a journal", async () => {
    const result = await createJournal({ ownerID: NEW_USER_ID, name: "test2" });
    if ("error" in result) throw new Error(result.error);
    expect(result.ownerID).toBe(NEW_USER_ID);

    // Make sure the user is now a journal designer
    const { rows: users } = await query("SELECT 1 FROM users WHERE id = $1", [
      NEW_USER_ID,
    ]);
    expect(users).toHaveLength(1);
    const { rows: designers } = await query(
      "SELECT 1 FROM journal_designers WHERE id = $1",
      [NEW_USER_ID],
    );
    expect(designers).toHaveLength(1);
  });

  it("works for a user that already has rows", async () => {
    const first = await createJournal({ ownerID: IDS.editor1, name: "test3" });
    const second = await createJournal({ ownerID: IDS.editor1, name: "test4" });
    expect(first).not.toHaveProperty("error");
    expect(second).not.toHaveProperty("error");

    const { rows } = await query(
      "SELECT name FROM journals WHERE owner_id = $1 ORDER BY name",
      [IDS.editor1],
    );
    expect(rows.map((r) => r.name)).toEqual([
      "Journal of Plant Cell Culture",
      "test3",
      "test4",
    ]);
  });

  it("handler sets the owner to the logged-in user", async () => {
    const result = await handler(
      buildEvent({ userID: IDS.editor2, body: { name: "test5" } }),
    );
    expect(result.statusCode).toBe(201);
    expect(JSON.parse(result.body).ownerID).toBe(IDS.editor2);
  });

  it("handler returns 401 without a logged-in user", async () => {
    const result = await handler(buildEvent({ body: { name: "test6" } }));
    expect(result.statusCode).toBe(401);

    // Make sure nothing was inserted
    const { rows } = await query("SELECT 1 FROM journals WHERE name = 'test6'");
    expect(rows).toHaveLength(0);
  });
});
