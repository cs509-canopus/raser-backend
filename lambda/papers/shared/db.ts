// Real Postgres connection, used only by the `handler` exports (never by the core logic
// functions the tests exercise — those take a QueryFn and don't know pg exists).
//
// Credentials/host come in as plain env vars that CloudFormation resolves at *deploy*
// time (Secrets Manager / SSM dynamic references — see lib/database-stack.ts and
// lib/api-stack.ts for why: the Lambda's VPC subnets have no path to either service's
// API at runtime). By the time this code runs, they're just strings.
import { Pool } from "pg";
import type { QueryFn } from "./types";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 5432),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      // One Lambda execution environment handles one request at a time, so it only
      // ever needs one connection; keeps a burst of concurrent invocations from
      // exhausting the db.t4g.micro instance's connection limit.
      max: 1,
      // DESIGN FLAG for Krishna/the database master: RDS Postgres requires/prefers TLS,
      // but validating the server cert means shipping the RDS CA bundle into the Lambda
      // bundle, which nobody's wired up yet. `rejectUnauthorized: false` still encrypts
      // the connection, it just doesn't verify the server's identity on that encrypted
      // channel — acceptable to get something working for a class project, not
      // something to carry into anything real. Revisit before this matters.
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

export const query: QueryFn = async (sql, params) => {
  const result = await getPool().query(sql, params as unknown[]);
  return { rows: result.rows };
};
