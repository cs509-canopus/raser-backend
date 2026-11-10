import { createJournal } from "../lambda/journals/create-journal";
import { query } from "../lambda/db";
import { describeWithDatabase, IDS } from "./db/describe-with-database";

describeWithDatabase("createJournal", () => {
  it("inserts the journal with just name and returns it", async () => {
    const result = await createJournal({ name: "test1" });
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
});
