/**
 * Which databases the Postgres suites may be pointed at. Every suite
 * truncates every table of the database it is given, so only a throwaway
 * one on this machine will do, and never the staging database that
 * `scripts/test-db.sh staging start` runs beside it (Ruling 75): that one
 * holds a staging store's merchant, session and orders.
 */

/** The port scripts/test-db.sh gives the staging database; its STAGING_PORT must match. */
export const STAGING_PORT = 55433;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Why `url` can't be the suites' database, or null when it can. */
export function testDatabaseRefusal(url: string): string | null {
  const { hostname, port } = new URL(url);
  if (!LOOPBACK_HOSTS.has(hostname)) return "REWARDS_TEST_DATABASE_URL must be a loopback database: the Postgres tests truncate every table";
  if (Number(port) === STAGING_PORT) {
    return `REWARDS_TEST_DATABASE_URL names the staging database (port ${STAGING_PORT}): the Postgres tests truncate every table, so they never run against it`;
  }
  return null;
}
