// Lazily creates a user's rows the first time they're needed (Cognito has no row for them yet).
import type { PoolClient } from "pg";

/**
 * Makes sure `userID` has a row in `users` and `journal_designers`. Safe to call when the
 * rows already exist.
 * @param client - client of the transaction to run in
 * @param userID - ID of the logged-in user
 */
export async function ensureJournalDesigner(
  client: PoolClient,
  userID: string,
): Promise<void> {
  await ensureUser(client, userID);
  await client.query(
    `INSERT INTO journal_designers (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
    [userID],
  );
}

/**
 * Makes sure `userID` has a row in `users` and `rubric_designers`. Safe to call when the
 * rows already exist.
 * @param client - client of the transaction to run in
 * @param userID - ID of the logged-in user
 */
export async function ensureRubricDesigner(
  client: PoolClient,
  userID: string,
): Promise<void> {
  await ensureUser(client, userID);
  await client.query(
    `INSERT INTO rubric_designers (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
    [userID],
  );
}

async function ensureUser(client: PoolClient, userID: string): Promise<void> {
  await client.query(
    `INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
    [userID],
  );
}
