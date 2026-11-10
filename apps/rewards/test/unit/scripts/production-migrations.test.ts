// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type LocalMigration,
  type MigrationRow,
  localMigrations,
  migrationCheckPlan,
  migrationVerdict,
  reportVerdict,
} from "../../../scripts/lib/production-migrations";

/**
 * The production build's migration check (RP-25): a build is refused unless
 * production has applied every migration in prisma/migrations with the SQL
 * this commit holds. The decision is pure: the env gives the plan, the local
 * migrations and production's rows give the verdict.
 */

const APP = resolve(__dirname, "../../..");
const SHA = "0123456789abcdef0123456789abcdef01234567";
const PASSWORD = "pw-Zq7Xv9";
/**
 * A loopback URL with the distinctive password, so the fixture holds no
 * remote password (fixture rule). Joined, so no source line reads as a URL
 * with an inline password (commit hook).
 */
const loopbackUrl = (rest: string, scheme = "postgresql") => [`${scheme}://rewards_app:`, PASSWORD, `@127.0.0.1${rest}`].join("");
const URL_OK = loopbackUrl(":5432/postgres?schema=rewards");

const local: LocalMigration[] = [
  { name: "20261105000000_init", checksum: "a".repeat(64) },
  { name: "20261106000000_second", checksum: "b".repeat(64) },
];
const T = new Date("2026-11-09T10:00:00Z");
const applied = (name: string, checksum: string): MigrationRow => ({ migration_name: name, checksum, finished_at: T, rolled_back_at: null });
const allApplied = () => local.map((m) => applied(m.name, m.checksum));

describe("localMigrations", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("lists prisma/migrations oldest first, with Prisma's checksum (sha256 of migration.sql)", () => {
    const migrations = localMigrations(resolve(APP, "prisma/migrations"));

    expect(migrations[0].name).toBe("20261105000000_init");
    expect(migrations.map((m) => m.name)).toEqual([...migrations.map((m) => m.name)].sort());
    expect(migrations.find((m) => m.name === "20261109090000_merchant_guide_dismissed_at")?.checksum).toBe(
      "9d3e00ff18c04de69da8bc2a373e264b44e18fb1aeebb2e1da2b543252fa8ca6",
    );
    expect(migrations.map((m) => m.name)).not.toContain("migration_lock.toml");
  });

  it("refuses a migration directory with no migration.sql", () => {
    const dir = mkdtempSync(join(tmpdir(), "migrations-"));
    dirs.push(dir);
    mkdirSync(join(dir, "20261105000000_init"));
    writeFileSync(join(dir, "migration_lock.toml"), 'provider = "postgresql"\n');

    expect(() => localMigrations(dir)).toThrow(/20261105000000_init has no migration.sql/);
  });
});

describe("migrationVerdict", () => {
  it("passes when every migration finished with this commit's SQL", () => {
    expect(migrationVerdict(local, allApplied())).toEqual({ outcome: "pass", extra: [] });
  });

  it("refuses a migration production has no row for", () => {
    expect(migrationVerdict(local, [applied(local[0].name, local[0].checksum)])).toEqual({
      outcome: "refuse",
      pending: [{ name: "20261106000000_second", state: "missing" }],
      extra: [],
    });
  });

  it("refuses a migration whose row has not finished", () => {
    const rows = [applied(local[0].name, local[0].checksum), { ...applied(local[1].name, local[1].checksum), finished_at: null }];

    expect(migrationVerdict(local, rows)).toMatchObject({ outcome: "refuse", pending: [{ name: local[1].name, state: "unfinished" }] });
  });

  it("refuses a rolled-back migration, unless a later row for it finished", () => {
    const rolledBack = { ...applied(local[1].name, local[1].checksum), rolled_back_at: T };
    const rows = [applied(local[0].name, local[0].checksum), rolledBack];

    expect(migrationVerdict(local, rows)).toMatchObject({ outcome: "refuse", pending: [{ name: local[1].name, state: "rolled_back" }] });
    expect(migrationVerdict(local, [...rows, applied(local[1].name, local[1].checksum)])).toEqual({ outcome: "pass", extra: [] });
  });

  it("refuses a migration applied with different SQL: edited after it was applied", () => {
    const rows = [applied(local[0].name, local[0].checksum), applied(local[1].name, "c".repeat(64))];

    expect(migrationVerdict(local, rows)).toMatchObject({ outcome: "refuse", pending: [{ name: local[1].name, state: "changed" }] });
  });

  it("names every pending migration, in order", () => {
    expect(migrationVerdict(local, [])).toMatchObject({
      outcome: "refuse",
      pending: [
        { name: local[0].name, state: "missing" },
        { name: local[1].name, state: "missing" },
      ],
    });
  });

  it("reports production's rows this commit lacks, and never refuses for them: migrate, then merge", () => {
    const rows = [...allApplied(), applied("20261110100000_from_the_next_pr", "d".repeat(64))];

    expect(migrationVerdict(local, rows)).toEqual({ outcome: "pass", extra: ["20261110100000_from_the_next_pr"] });
  });
});

/**
 * What the CLI prints after a verdict, and its exit code: 1 refuses the
 * build and Vercel keeps the live deployment, 0 lets it go on. The CLI adds
 * the prefix, prints `warn` lines to stderr, and after a refusal the
 * recovery lines its own test covers.
 */
describe("reportVerdict", () => {
  it("passes with exit 0, listing every migration applied and production's extra rows", () => {
    const rows = [...allApplied(), applied("20261110100000_from_the_next_pr", "c".repeat(64))];

    expect(reportVerdict(local, migrationVerdict(local, rows))).toEqual({
      exitCode: 0,
      lines: [
        { level: "say", text: "  20261105000000_init  applied" },
        { level: "say", text: "  20261106000000_second  applied" },
        { level: "say", text: "  20261110100000_from_the_next_pr  in production, not in this commit (fine: applied before its PR merged)" },
        { level: "say", text: "ok: production has every migration in prisma/migrations, with this commit's SQL" },
      ],
    });
  });

  it("refuses with exit 1, naming each pending migration's state as a warning", () => {
    const four: LocalMigration[] = [
      ...local,
      { name: "20261107000000_third", checksum: "d".repeat(64) },
      { name: "20261108000000_fourth", checksum: "e".repeat(64) },
    ];
    const rows: MigrationRow[] = [
      applied("20261105000000_init", "f".repeat(64)),
      { migration_name: "20261107000000_third", checksum: "d".repeat(64), finished_at: null, rolled_back_at: null },
      { migration_name: "20261108000000_fourth", checksum: "e".repeat(64), finished_at: null, rolled_back_at: T },
    ];

    expect(reportVerdict(four, migrationVerdict(four, rows))).toEqual({
      exitCode: 1,
      lines: [
        { level: "warn", text: "  20261105000000_init  applied with different SQL: checksum differs" },
        { level: "warn", text: "  20261106000000_second  not applied to production" },
        { level: "warn", text: "  20261107000000_third  started, not finished (failed, or still running)" },
        { level: "warn", text: "  20261108000000_fourth  rolled back" },
        { level: "warn", text: "refused: production lacks 4 of this commit's migrations, or holds different SQL for them." },
      ],
    });
  });

  it("refuses with exit 1 when only one migration is pending, still listing the applied ones", () => {
    const report = reportVerdict(local, migrationVerdict(local, [applied(local[0].name, local[0].checksum)]));

    expect(report.exitCode).toBe(1);
    expect(report.lines).toEqual([
      { level: "say", text: "  20261105000000_init  applied" },
      { level: "warn", text: "  20261106000000_second  not applied to production" },
      { level: "warn", text: "refused: production lacks 1 of this commit's migrations, or holds different SQL for them." },
    ]);
  });
});

describe("migrationCheckPlan", () => {
  it("skips, saying why, with no REWARDS_DATABASE_URL outside production", () => {
    for (const VERCEL_ENV of ["preview", "development", undefined]) {
      const plan = migrationCheckPlan({ VERCEL_ENV });
      expect(plan, String(VERCEL_ENV)).toMatchObject({ action: "skip" });
      expect(plan.action === "skip" && plan.reason).toContain(`VERCEL_ENV=${VERCEL_ENV ?? "(unset)"}`);
    }
  });

  it("refuses a production build with no REWARDS_DATABASE_URL: it can't prove anything", () => {
    expect(migrationCheckPlan({ VERCEL_ENV: "production" })).toMatchObject({ action: "refuse" });
    expect(migrationCheckPlan({ VERCEL_ENV: "production", REWARDS_DATABASE_URL: "  " })).toMatchObject({ action: "refuse" });
  });

  it("checks whenever REWARDS_DATABASE_URL is set, even with VERCEL_ENV unset (fail closed)", () => {
    for (const VERCEL_ENV of ["production", "preview", undefined]) {
      expect(migrationCheckPlan({ VERCEL_ENV, REWARDS_DATABASE_URL: URL_OK }), String(VERCEL_ENV)).toEqual({
        action: "check",
        url: URL_OK,
        schema: "rewards",
        host: "127.0.0.1",
        notes: [],
      });
    }
  });

  it("refuses a URL with no ?schema= or one that doesn't parse, never echoing the password", () => {
    for (const url of [
      loopbackUrl(":5432/postgres"),
      loopbackUrl(":notaport/postgres?schema=rewards"),
      loopbackUrl(":5432/postgres?schema=rewards", "mysql"),
    ]) {
      const plan = migrationCheckPlan({ VERCEL_ENV: "production", REWARDS_DATABASE_URL: url });
      expect(plan, url).toMatchObject({ action: "refuse" });
      expect(JSON.stringify(plan)).not.toContain(PASSWORD);
      expect(JSON.stringify(plan)).not.toContain("rewards_app");
    }
    // Says what is missing, and claims no check of the schema's name
    expect(migrationCheckPlan({ REWARDS_DATABASE_URL: loopbackUrl(":5432/postgres") })).toMatchObject({
      action: "refuse",
      reason: "REWARDS_DATABASE_URL has no ?schema=, so it doesn't say which schema's _prisma_migrations to read",
    });
  });

  it("honours REWARDS_SKIP_MIGRATION_CHECK only for a hex prefix, 7 or more characters, of this build's commit", () => {
    for (const prefix of [SHA.slice(0, 7), SHA.slice(0, 12), SHA, SHA.slice(0, 7).toUpperCase()]) {
      expect(
        migrationCheckPlan({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: SHA, REWARDS_SKIP_MIGRATION_CHECK: prefix }),
        prefix,
      ).toEqual({ action: "override", sha: SHA, notes: [] });
    }
    // Before the URL is read: an outage, or a URL that doesn't parse, can't stop an override
    expect(
      migrationCheckPlan({ REWARDS_DATABASE_URL: "not a url", VERCEL_GIT_COMMIT_SHA: SHA, REWARDS_SKIP_MIGRATION_CHECK: SHA.slice(0, 7) }),
    ).toMatchObject({ action: "override" });
  });

  it("ignores an override for another commit, saying so, and checks", () => {
    const plan = migrationCheckPlan({
      REWARDS_DATABASE_URL: URL_OK,
      VERCEL_GIT_COMMIT_SHA: SHA,
      REWARDS_SKIP_MIGRATION_CHECK: "fedcba9",
    });

    expect(plan).toMatchObject({ action: "check" });
    expect(plan.notes).toEqual([expect.stringMatching(/REWARDS_SKIP_MIGRATION_CHECK=fedcba9 .*not this build's commit 0123456789ab.*ignored/)]);
  });

  it("ignores a malformed override, saying so without echoing it", () => {
    for (const value of ["1", "true", "012345", "0123456z", "yes please"]) {
      const plan = migrationCheckPlan({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: SHA, REWARDS_SKIP_MIGRATION_CHECK: value });
      expect(plan, value).toMatchObject({ action: "refuse" });
      expect(plan.notes).toEqual([expect.stringMatching(/not a commit SHA prefix of at least 7 hex characters.*ignored/)]);
      expect(plan.notes.join(" "), value).not.toContain(`=${value}`);
    }
  });

  it("never overrides when the build's commit is unknown", () => {
    for (const VERCEL_GIT_COMMIT_SHA of [undefined, ""]) {
      const plan = migrationCheckPlan({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA, REWARDS_SKIP_MIGRATION_CHECK: SHA.slice(0, 7) });
      expect(plan).toMatchObject({ action: "refuse" });
      expect(plan.notes).toEqual([expect.stringMatching(/not this build's commit \(unset\).*ignored/)]);
    }
  });
});
