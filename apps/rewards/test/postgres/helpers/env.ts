/**
 * Points the app's Prisma client (app/db.server.ts) and the Prisma CLI URL
 * at the Postgres test database before any test imports ~/db.server.
 * vitest.postgres.config.ts runs it after test/setup.ts.
 *
 * REWARDS_TEST_DATABASE_URL must be a loopback database the tests may wipe:
 * every test truncates all tables. The staging database (`scripts/test-db.sh
 * staging`, Ruling 75) is refused by its port (test-database-url.ts). CI
 * requires it; locally the suites are skipped without it
 * (scripts/test-db.sh start prints it).
 */
import { testDatabaseRefusal } from "./test-database-url";

// Without a test database: a URL nothing answers on, so ~/db.server still
// imports (the suites then skip) and a database URL from the shell is never used.
const NO_DATABASE_URL = "postgresql://rewards_app@127.0.0.1:9/no_test_database?schema=rewards";

const url = process.env.REWARDS_TEST_DATABASE_URL?.trim();

if (url) {
  const refusal = testDatabaseRefusal(url);
  if (refusal) throw new Error(refusal);
} else if (process.env.CI) {
  throw new Error("REWARDS_TEST_DATABASE_URL is required in CI");
}

process.env.REWARDS_DATABASE_URL = url || NO_DATABASE_URL;
process.env.REWARDS_DIRECT_URL = url || NO_DATABASE_URL;
