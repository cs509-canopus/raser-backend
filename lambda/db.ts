// Shared helpers for database operations
import { Pool, PoolClient, QueryResultRow } from "pg";
import { Signer } from "@aws-sdk/rds-signer";

const { DB_HOST, DB_PORT, DB_USER, DB_NAME, AWS_REGION } = process.env;
const port = Number(DB_PORT ?? 5432);

const signer = new Signer({
  hostname: DB_HOST!,
  port,
  username: DB_USER!,
  region: AWS_REGION, // Lambda sets AWS_REGION automatically
});

/**
 * Pool connected to the RDS database.
 */
export const pool = new Pool({
  host: DB_HOST,
  port,
  user: DB_USER,
  database: DB_NAME,
  password: () => signer.getAuthToken(), // called once per NEW connection
  ssl: { rejectUnauthorized: true }, // IAM auth requires TLS; verify the cert
  max: 1, // one request at a time per environment
  idleTimeoutMillis: 5 * 60_000, // see "timeouts" below
  connectionTimeoutMillis: 5_000, // fail fast instead of hanging until Lambda times out
  statement_timeout: 10_000, // server-side cap per statement
  application_name: process.env.AWS_LAMBDA_FUNCTION_NAME, // shows up in pg_stat_activity
});

// Without a listener, an idle-client error would crash the runtime.
pool.on("error", (err) => {
  console.warn("Idle Postgres connection dropped; pool will replace it", err);
});

const CONNECTION_ERRORS = new Set([
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "57P01",
  "57P05",
]);
const isConnectionError = (e: any) =>
  CONNECTION_ERRORS.has(e?.code) ||
  /Connection terminated/i.test(e?.message ?? "");

/**
 * Executes a single SQL statement on the database using the pool. Passes parameters to
 * `pg.Pool.query`, so see documentation for that function for usage
 * @param text - SQL code with placeholder parameters
 * @param params - values for placeholder parameters
 * @returns Query result
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: unknown[],
) {
  try {
    return await pool.query<T>(text, params);
  } catch (e) {
    if (!isConnectionError(e)) throw e;
    return pool.query<T>(text, params); // pool already discarded the dead client
  }
}

/**
 * Execute multiple SQL statements in a single transaction.
 */
export async function withTransaction<T>(
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let broken: Error | undefined;
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch((rbErr) => {
      broken = rbErr;
    });
    throw e;
  } finally {
    client.release(broken); // passing an error tells the pool to destroy, not reuse, it
  }
}
