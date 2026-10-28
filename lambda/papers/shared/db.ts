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
      max: 1,
      // TODO: verify server cert once the RDS CA bundle is in the bundle
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

export const query: QueryFn = async (sql, params) => {
  const result = await getPool().query(sql, params as unknown[]);
  return { rows: result.rows };
};
