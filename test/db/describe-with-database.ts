import { Client } from "pg";

const TEMPLATE_DB = "raser_template"; // keep in sync with global-setup.ts

/**
 * IDs of the rows in test/db/test-data.sql.
 * Scheme: TTTTTTTT-0000-4000-8000-PPPPPPPPPPPP
 *   T = row type: 1 user, 2 journal, 3 issue, 4 paper, 5 rubric, 6 review
 *   P = position, two digits per level from parent to child (users end in e = editor, d = designer)
 * Everything numbered N belongs together: editorN owns journalN, designerN owns rubricN,
 * and reviewN scores journalN's issue 1 paper 1 using rubricN.
 */
export const IDS = {
  // Users
  editor1: "11111111-0000-4000-8000-0000000000e1",
  editor2: "11111111-0000-4000-8000-0000000000e2",
  designer1: "11111111-0000-4000-8000-0000000000d1",
  designer2: "11111111-0000-4000-8000-0000000000d2",

  // Journals: journal1 has all optional fields set, journal2 has website/cover NULL
  journal1: "22222222-0000-4000-8000-000000000001",
  journal2: "22222222-0000-4000-8000-000000000002",

  // Issues: issue 1 of each journal has two papers, issue 2 is empty
  journal1Issue1: "33333333-0000-4000-8000-000000000101",
  journal1Issue2: "33333333-0000-4000-8000-000000000102",
  journal2Issue1: "33333333-0000-4000-8000-000000000201",
  journal2Issue2: "33333333-0000-4000-8000-000000000202",

  // Papers: paper 1 of each issue has a review, paper 2 has none
  journal1Issue1Paper1: "44444444-0000-4000-8000-000000010101",
  journal1Issue1Paper2: "44444444-0000-4000-8000-000000010102",
  journal2Issue1Paper1: "44444444-0000-4000-8000-000000020101",
  journal2Issue1Paper2: "44444444-0000-4000-8000-000000020102",

  // Rubrics: both published, 2 questions in each of the 5 sections
  rubric1: "55555555-0000-4000-8000-000000000001",
  rubric2: "55555555-0000-4000-8000-000000000002",

  // Reviews
  review1: "66666666-0000-4000-8000-000000000001", // complete: all 10 answered, total 42
  review2: "66666666-0000-4000-8000-000000000002", // in progress: 5 of 10 answered
} as const;

/**
 * Like `describe`, but every `it` inside gets a mock database with test data
 */
export function describeWithDatabase(name: string, fn: () => void): void {
  describe(name, () => {
    beforeEach(async () => {
      // Create a fresh database from the template
      const db = testDatabaseName();
      await admin(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
      await admin(`CREATE DATABASE "${db}" TEMPLATE "${TEMPLATE_DB}"`);
    });

    // Drop the database that was used
    afterEach(async () => {
      // FORCE also closes the connection lambda/db.ts's pool is holding. The pool discards
      // it, and the next test's first query opens a new connection to the fresh database.
      await admin(
        `DROP DATABASE IF EXISTS "${testDatabaseName()}" WITH (FORCE)`,
      );
    });

    fn();
  });
}

function testDatabaseName(): string {
  const name = process.env.DB_NAME;
  if (!name)
    throw new Error(
      "DB_NAME is not set. Is test/db/setup-env.ts listed in setupFiles?",
    );
  return name;
}

async function admin(sql: string): Promise<void> {
  const url = process.env.TEST_ADMIN_URL;
  if (!url)
    throw new Error(
      "TEST_ADMIN_URL is not set. Is globalSetup configured in jest.config.js?",
    );
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}
