import { Client } from "pg";

const TEMPLATE_DB = "raser_template"; // keep in sync with global-setup.ts

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
