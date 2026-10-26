import { readFileSync } from "fs";
import { join } from "path";
import { handler } from "../lambda/echo";

const event = JSON.parse(
  readFileSync(join(__dirname, "events", "echo", "echo.event.jsonc"), "utf-8"),
);

test("function-name handler test", async () => {
  const result = await handler(event);

  expect(result.statusCode).toBe(200);
  expect(JSON.parse(result.body)).toEqual({
    text: "Hello, World!Hello, World!Hello, World!",
  });
});
