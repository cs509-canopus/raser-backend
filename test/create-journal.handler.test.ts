import { readFileSync } from "fs";
import { join } from "path";
import { handler } from "../lambda/journals/create-journal"; // replace with actual function

const event = JSON.parse(
  // Replace function-name and logic
  readFileSync(
    join(__dirname, "events", "create-journal", "create-journal.event.json"),
    "utf-8",
  ),
);

test("create-journal handler test", async () => {
  const result = await handler(event);

  expect(result.statusCode).toBe(200);
  expect(JSON.parse(result.body)).toEqual({
    /* response fields */
  });
});