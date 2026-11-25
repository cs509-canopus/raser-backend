// Each Jest worker gets its own database name (raser_test_1, raser_test_2, ...).
// The name never changes for the life of the worker, so lambda/db.ts's pool, which reads
// DB_NAME once at import, stays valid. Only the database behind the name is replaced.
process.env.DB_NAME = `raser_test_${process.env.JEST_WORKER_ID ?? "1"}`;

// Dropping the database after each test closes the pool's idle connection on purpose.
// lambda/db.ts logs a warning when that happens; hide that one expected message.
const originalWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  if (
    typeof args[0] === "string" &&
    args[0].startsWith("Idle Postgres connection dropped")
  )
    return;
  originalWarn(...args);
};
