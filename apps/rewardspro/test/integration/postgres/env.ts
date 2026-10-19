/**
 * Points the app's Prisma client (app/db.server.ts) at the integration
 * database before any app module loads.
 *
 * REWARDSPRO_TEST_DATABASE_URL must be a loopback database the tests may
 * wipe: every test truncates all tables. CI requires it; locally the suites
 * are skipped without it.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const url = process.env.REWARDSPRO_TEST_DATABASE_URL?.trim();

if (url) {
  if (!LOOPBACK_HOSTS.has(new URL(url).hostname)) {
    throw new Error(
      "REWARDSPRO_TEST_DATABASE_URL must be a loopback database: the integration tests truncate every table",
    );
  }
  process.env.DATABASE_URL = url;
} else if (process.env.CI) {
  throw new Error("REWARDSPRO_TEST_DATABASE_URL is required in CI");
}
