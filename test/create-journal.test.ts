import { createJournal } from "../lambda/journals/create-journal";
import { query } from "../lambda/db";
import { describeWithDatabase } from "./db/describe-with-database";

describeWithDatabase("createJournal", () => {
  it("inserts the journal and returns it", async () => {
    const result = await createJournal({ name: "Plant Cell Reports" });
    if ("error" in result) throw new Error(result.error);

    expect(result).toMatchObject({ name: "Plant Cell Reports", description: null });
    const { rows } = await query("SELECT name FROM journals WHERE id = $1", [result.journalID]);
    expect(rows).toEqual([{ name: "Plant Cell Reports" }]);
  });

  it("starts fresh: the journal from the previous test is gone", async () => {
    const { rows } = await query("SELECT 1 FROM journals WHERE name = $1", ["Plant Cell Reports"]);
    expect(rows).toHaveLength(0);
  });
});
