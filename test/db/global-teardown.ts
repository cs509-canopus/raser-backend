import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";

type GlobalWithContainer = typeof globalThis & {
  __PG_CONTAINER__?: StartedPostgreSqlContainer;
};

export default async function globalTeardown(): Promise<void> {
  await (globalThis as GlobalWithContainer).__PG_CONTAINER__?.stop();
}
