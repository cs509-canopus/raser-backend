import { echo } from "../lambda/echo";
import { describeCases } from "./helpers/describeCases";

describeCases("echo", echo, [
  { input: { text: "abc", quantity: 1 }, expected: { text: "abc" } },
  { input: { text: "abc", quantity: 2 }, expected: { text: "abcabc" } },
  { input: { text: "abc", quantity: 0 }, expected: { text: "" } },
  {
    input: { text: "abc", quantity: 1.5 },
    expected: { error: "Quantity must be an integer" },
  },
  {
    input: { text: "abc", quantity: -1 },
    expected: { error: "Quantity cannot be negative" },
  },
]);
