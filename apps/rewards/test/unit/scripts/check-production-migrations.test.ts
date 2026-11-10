// @vitest-environment node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * scripts/check-production-migrations.ts, the step vercel.json runs before
 * the build (RP-25): exit 0 lets the build go on, anything else refuses it
 * and Vercel keeps the live deployment. Nothing here reaches a real
 * database: the only URL is a loopback port nothing answers on.
 */

const APP = resolve(__dirname, "../../..");
const SHA = "0123456789abcdef0123456789abcdef01234567";
// Distinctive, so a leak can't hide in ordinary words
const USER = "u-Kp4Wn2";
const PASSWORD = "pw-Zq7Xv9";
// Joined, so no source line reads as a URL with an inline password (commit hook)
const UNREACHABLE = ["postgresql://", USER, ":", PASSWORD, "@127.0.0.1:1/postgres?schema=rewards"].join("");

function runCheck(env: Record<string, string>) {
  const base = { ...process.env };
  for (const name of ["REWARDS_DATABASE_URL", "VERCEL_ENV", "VERCEL_GIT_COMMIT_SHA", "REWARDS_SKIP_MIGRATION_CHECK"]) delete base[name];
  const run = spawnSync(resolve(APP, "node_modules/.bin/tsx"), ["scripts/check-production-migrations.ts"], {
    cwd: APP,
    env: { ...base, ...env },
    encoding: "utf8",
    timeout: 30_000,
  });
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

describe("scripts/check-production-migrations.ts", () => {
  it("skips a preview build with no database URL, saying why", () => {
    const { status, output } = runCheck({ VERCEL_ENV: "preview" });

    expect(status).toBe(0);
    expect(output).toContain("[migration-check] skipped: no REWARDS_DATABASE_URL and VERCEL_ENV=preview");
  });

  it("refuses a production build with no database URL", () => {
    const { status, output } = runCheck({ VERCEL_ENV: "production" });

    expect(status).toBe(1);
    expect(output).toContain("[migration-check] refused");
  });

  it("refuses when production's migrations can't be read, printing neither the user nor the password", () => {
    const { status, output } = runCheck({ VERCEL_ENV: "production", REWARDS_DATABASE_URL: UNREACHABLE, VERCEL_GIT_COMMIT_SHA: SHA });

    expect(status).toBe(1);
    expect(output).toContain("could not read production's migrations (ECONNREFUSED)");
    expect(output).toContain("redeploy the failed deployment of this commit");
    expect(output).toContain("REWARDS_SKIP_MIGRATION_CHECK=0123456");
    expect(output).not.toContain(PASSWORD);
    expect(output).not.toContain(USER);
  });

  it("builds this commit unchecked when the escape hatch names it, loudly, without connecting", () => {
    const { status, output } = runCheck({
      VERCEL_ENV: "production",
      REWARDS_DATABASE_URL: UNREACHABLE,
      VERCEL_GIT_COMMIT_SHA: SHA,
      REWARDS_SKIP_MIGRATION_CHECK: SHA.slice(0, 7),
    });

    expect(status).toBe(0);
    expect(output).toContain("WARNING");
    expect(output).toContain("NOT checking production's migrations");
    expect(output).not.toContain("could not read");
  });

  it("ignores a malformed escape hatch, saying so, and still refuses", () => {
    const { status, output } = runCheck({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: SHA, REWARDS_SKIP_MIGRATION_CHECK: "1" });

    expect(status).toBe(1);
    expect(output).toContain("REWARDS_SKIP_MIGRATION_CHECK is not a commit SHA prefix of at least 7 hex characters: ignored");
    expect(output).not.toContain("WARNING");
  });
});
