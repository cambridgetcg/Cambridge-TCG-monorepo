// @vitest-environment node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STAGING_PORT, testDatabaseRefusal } from "../../postgres/helpers/test-database-url";

/**
 * scripts/test-db.sh's two databases (Ruling 75): the Postgres suites'
 * throwaway one, and staging's own, which no suite may ever reach. Every
 * suite truncates every table of the database it is given, so the guard the
 * suites load (test/postgres/helpers/env.ts) refuses the staging port.
 */

const SCRIPT = resolve(__dirname, "../../../scripts/test-db.sh");
const TEST_URL = "postgresql://rewards_app@127.0.0.1:55432/postgres?schema=rewards&connection_limit=1";

/** The export lines `scripts/test-db.sh <args>` prints, as name → value; `url` starts nothing. */
function exportsOf(...args: string[]): Record<string, string> {
  const run = spawnSync("bash", [SCRIPT, ...args], { encoding: "utf8" });
  expect(run.status, run.stderr).toBe(0);
  return Object.fromEntries(
    run.stdout
      .trim()
      .split("\n")
      .map((line) => {
        const [, name, value] = /^export (\w+)='([^']*)'$/.exec(line) ?? [];
        expect(name, line).toBeTruthy();
        return [name, value];
      }),
  );
}

describe("the test database guard", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    vi.resetModules();
  });

  it("accepts the throwaway test database", () => {
    expect(testDatabaseRefusal(TEST_URL)).toBeNull();
  });

  it("refuses a database that isn't on this machine", () => {
    expect(testDatabaseRefusal("postgresql://rewards_app@db.example.com:5432/postgres?schema=rewards")).toMatch(/loopback/);
  });

  it("gives staging its own port, its own variables and three connections", () => {
    const staging = exportsOf("staging", "url");

    expect(Object.keys(staging).sort()).toEqual(["REWARDS_DATABASE_URL", "REWARDS_DIRECT_URL"]);
    const app = new URL(staging.REWARDS_DATABASE_URL);
    expect([app.hostname, Number(app.port), app.searchParams.get("schema"), app.searchParams.get("connection_limit")]).toEqual([
      "127.0.0.1",
      STAGING_PORT,
      "rewards",
      "3",
    ]);
    // Migrations take the same database, without the pool's limit
    const direct = new URL(staging.REWARDS_DIRECT_URL);
    expect([direct.host, direct.pathname, direct.searchParams.get("schema"), direct.searchParams.get("connection_limit")]).toEqual([
      app.host,
      app.pathname,
      "rewards",
      null,
    ]);
  });

  it("refuses the staging database, whichever of its URLs a suite is given", () => {
    for (const url of Object.values(exportsOf("staging", "url"))) {
      expect(testDatabaseRefusal(url), url).toMatch(/staging/);
    }
  });

  it("is what the Postgres suites load: they stop before any test when pointed at staging", async () => {
    process.env.REWARDS_TEST_DATABASE_URL = exportsOf("staging", "url").REWARDS_DATABASE_URL;
    delete process.env.REWARDS_DATABASE_URL;

    await expect(import("../../postgres/helpers/env")).rejects.toThrow(/staging/);
    expect(process.env.REWARDS_DATABASE_URL).toBeUndefined();
  });
});
