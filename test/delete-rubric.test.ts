import { deleteRubric } from "../lambda/rubrics/delete-rubric";
import { query } from "../lambda/db";
import { describeWithDatabase, IDS } from "./db/describe-with-database";
import { readFileSync } from "fs";
import { join } from "path";

describeWithDatabase("deleteRubric", () => {
});
