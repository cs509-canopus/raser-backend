import { readFileSync } from "node:fs";
import * as path from "node:path";
import { Client } from "pg";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";

const TEMPLATE_DB = "raser_template";
const CERT_DIR = path.resolve(__dirname, "certs");
const SQL_FILES = [
  path.resolve(__dirname, "../../db/schema.sql"),
  path.resolve(__dirname, "test-data.sql"),
];

type GlobalWithContainer = typeof globalThis & {
  __PG_CONTAINER__?: StartedPostgreSqlContainer;
};

export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer("postgres:16.4-alpine")
    .withUsername("raser_admin")
    .withEnvironment({ POSTGRES_HOST_AUTH_METHOD: "trust" }) // never asks for a password, so the IAM signer is never used
    .withSSL(
      path.join(CERT_DIR, "server.crt"),
      path.join(CERT_DIR, "server.key"),
    )
    .start();

  const adminUrl = container.getConnectionUri();

  // Create a database that will be used as a template for all the mocks
  await withClient(adminUrl, (c) => c.query(`CREATE DATABASE ${TEMPLATE_DB}`));

  // Connect to template database and run SQL setup files
  const templateUrl = new URL(adminUrl);
  templateUrl.pathname = `/${TEMPLATE_DB}`;
  await withClient(templateUrl.toString(), async (c) => {
    for (const file of SQL_FILES) {
      try {
        await c.query(readFileSync(file, "utf8")); // no parameters, so a whole multi-statement file runs at once
      } catch (err) {
        throw new Error(
          `Failed to run ${path.relative(process.cwd(), file)}: ${(err as Error).message}`,
        );
      }
    }
  });

  // Cloning requires that nobody is connected to the template, so forbid connections to it.
  await withClient(adminUrl, (c) =>
    c.query(
      `ALTER DATABASE ${TEMPLATE_DB} WITH is_template = true ALLOW_CONNECTIONS = false`,
    ),
  );

  // Override environment variables to point to the test database
  process.env.DB_HOST = container.getHost();
  process.env.DB_PORT = String(container.getPort());
  process.env.DB_USER = container.getUsername();
  process.env.TEST_ADMIN_URL = adminUrl; // used by describeWithDatabase to create and drop databases

  (globalThis as GlobalWithContainer).__PG_CONTAINER__ = container;
}

async function withClient(
  url: string,
  fn: (c: Client) => Promise<unknown>,
): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await fn(client);
  } finally {
    await client.end();
  }
}
