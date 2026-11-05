/**
 * Points the app's Prisma client (app/db.server.ts) and the Prisma CLI URL
 * at the Postgres test database before any test imports ~/db.server.
 * vitest.postgres.config.ts runs it after test/setup.ts.
 *
 * REWARDS_TEST_DATABASE_URL must be a loopback database the tests may wipe:
 * every test truncates all tables. CI requires it; locally the suites are
 * skipped without it (scripts/test-db.sh start prints it).
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
// Without a test database: a URL nothing answers on, so ~/db.server still
// imports (the suites then skip) and a database URL from the shell is never used.
const NO_DATABASE_URL = "postgresql://rewards_app@127.0.0.1:9/no_test_database?schema=rewards";

const url = process.env.REWARDS_TEST_DATABASE_URL?.trim();

if (url) {
  if (!LOOPBACK_HOSTS.has(new URL(url).hostname)) {
    throw new Error(
      "REWARDS_TEST_DATABASE_URL must be a loopback database: the Postgres tests truncate every table",
    );
  }
} else if (process.env.CI) {
  throw new Error("REWARDS_TEST_DATABASE_URL is required in CI");
}

process.env.REWARDS_DATABASE_URL = url || NO_DATABASE_URL;
process.env.REWARDS_DIRECT_URL = url || NO_DATABASE_URL;
