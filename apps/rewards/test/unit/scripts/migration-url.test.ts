// @vitest-environment node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { migrationUrlProblem } from "../../../scripts/lib/migration-url";

/**
 * READINESS-1: the switch's migration runs as the owner holds it, and a
 * production URL of the wrong shape (the dashboard's `postgres` string, no
 * `?schema=`) would put every table in `public`, which the Data API serves
 * to the anon key. No password in a remote URL here (fixture rule).
 */

const POOLER = "aws-0-eu-west-2.pooler.supabase.com";
/** The expected shape the guard prints, joined here so no URL literal carries a password-like slot. */
const SHAPE = ["postgresql://rewards_app.<ref>:", "<password>", `@${POOLER}:5432/postgres?schema=rewards`].join("");
const APP = resolve(__dirname, "../../..");

describe("migrationUrlProblem", () => {
  it("accepts rewards_app, plain or with the project ref, on schema rewards", () => {
    expect(migrationUrlProblem(`postgresql://rewards_app.abcdefghijklmnopqrst@${POOLER}:5432/postgres?schema=rewards`)).toBeNull();
    expect(migrationUrlProblem(`postgresql://rewards_app@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?schema=rewards`)).toBeNull();
  });

  it("refuses a remote URL without schema rewards, naming the expected shape and never the password", () => {
    for (const url of [
      `postgresql://rewards_app.abcdefghijklmnopqrst@${POOLER}:5432/postgres`,
      `postgresql://rewards_app.abcdefghijklmnopqrst@${POOLER}:5432/postgres?schema=public`,
      `postgresql://rewards_app.abcdefghijklmnopqrst@${POOLER}:5432/postgres?schema=rewardspro`,
    ]) {
      const problem = migrationUrlProblem(url);
      expect(problem, url).toContain("schema rewards");
      expect(problem).toContain(SHAPE);
    }
  });

  it("refuses a remote URL for another role: the dashboard's postgres, the old app's role, a look-alike", () => {
    for (const user of ["postgres", "postgres.abcdefghijklmnopqrst", "rewardspro_app.abcdefghijklmnopqrst", "rewards_app_admin", "rewards_app."]) {
      const problem = migrationUrlProblem(`postgresql://${user}@${POOLER}:5432/postgres?schema=rewards`);
      expect(problem, user).toContain("role rewards_app");
      expect(problem).toContain("rewards_app.<ref>");
    }
  });

  it("lets loopback URLs through as they are: the local test bed and CI", () => {
    expect(migrationUrlProblem("postgresql://postgres:test@127.0.0.1:55432/postgres")).toBeNull();
    expect(migrationUrlProblem("postgresql://rewards_app:test@localhost:5432/postgres?schema=rewards")).toBeNull();
    expect(migrationUrlProblem("postgresql://anyone@[::1]:5432/postgres?schema=other")).toBeNull();
  });
});

describe("scripts/prisma-tls.ts", () => {
  it("stops before connecting when the remote URL has the wrong shape", () => {
    const run = spawnSync(resolve(APP, "node_modules/.bin/tsx"), ["scripts/prisma-tls.ts", "migrate", "status"], {
      cwd: APP,
      env: { ...process.env, REWARDS_DIRECT_URL: `postgresql://postgres.abcdefghijklmnopqrst@${POOLER}:5432/postgres` },
      encoding: "utf8",
      timeout: 30_000,
    });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("[prisma-tls]");
    expect(run.stderr).toContain("rewards_app.<ref>");
    // Refused before the bridge or Prisma started
    expect(run.stderr).not.toContain("bridging");
  });
});
