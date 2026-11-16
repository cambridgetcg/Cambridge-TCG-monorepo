// Opt-in: VERIFY_TEST_DATABASE_URL=postgres://<user>@127.0.0.1:<port>/<name containing "test">
// Runs GET /api/verify/health against real PostgreSQL, so its windows are the
// database's NOW() and not a mock's. The fairness tables come from their own
// migrations (0062, 0064, 0065, 0066); bounty_pulls and verifiable_draws are
// cut down to the columns the route and the two jobs read. Every row is
// synthetic.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const state = vi.hoisted(() => ({ pool: null as import("pg").Pool | null }));
vi.mock("@/lib/db", () => ({
  query: (sql: string, args?: unknown[]) => state.pool!.query(sql, args),
}));

import { GET } from "./route";

const target = process.env.VERIFY_TEST_DATABASE_URL;
const schema = `verify_health_test_${randomUUID().replaceAll("-", "")}`;
let admin: Pool;
let pool: Pool;

const migration = (name: string) => readFile(new URL(`../../../../../drizzle/${name}`, import.meta.url), "utf8");
const body = async () => (await GET()).json();

/** Audit rows `ageMinutes` old, one a minute, like the maintenance cron's. */
async function audits(count: number, newestAgeMinutes: number, allOk: boolean) {
  await pool.query(
    `INSERT INTO fairness_audits (run_at, source, subject_id, commitment_ok, outcome_ok, ordering_ok, merkle_ok, all_ok, reason)
     SELECT NOW() - make_interval(mins => $1 + g), 'bounty_pull', $2, true, $3, true, true, $3,
            CASE WHEN $3 THEN NULL ELSE 'outcome mismatch' END
       FROM generate_series(0, $4 - 1) AS g`,
    [newestAgeMinutes, randomUUID(), allOk, count],
  );
}

describe.skipIf(!target)("GET /api/verify/health on PostgreSQL (explicit loopback test database only)", () => {
  beforeAll(async () => {
    const url = new URL(target!);
    if (!["127.0.0.1", "[::1]", "localhost"].includes(url.hostname) || !url.pathname.includes("test") || url.search) {
      throw new Error("Explicit disposable local test database required");
    }
    admin = new Pool({ connectionString: target });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: target, options: `-c search_path=${schema}`, max: 2 });
    state.pool = pool;
    await pool.query(`
      CREATE TABLE bounty_pulls (
        id UUID PRIMARY KEY, rng_server_seed_hash TEXT, rng_server_seed TEXT,
        rolled_rarity TEXT, revealed_at TIMESTAMPTZ
      );
      CREATE TABLE verifiable_draws (
        id UUID PRIMARY KEY, commitment TEXT, server_seed TEXT,
        outcome JSONB, revealed_at TIMESTAMPTZ
      );`);
    for (const name of ["0062_fairness_digests.sql", "0064_fairness_audits.sql", "0065_fairness_alerts.sql", "0066_digest_chain.sql"]) {
      await pool.query(await migration(name));
    }
  });

  afterAll(async () => {
    if (pool) await pool.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE fairness_audits, fairness_alerts, bounty_pulls, verifiable_draws, fairness_digests");
    // One old digest whose only draw is gone, as on production after 2026-11-16.
    await pool.query(
      `INSERT INTO fairness_digests (root, leaf_count, leaves, created_at, window_from, window_to, prev_hash, chain_hash)
       VALUES ($1, 1, $2::jsonb, NOW() - interval '205 days', NOW() - interval '207 days', NOW() - interval '207 days', $3, $4)`,
      ["c".repeat(64), JSON.stringify(["c".repeat(64)]), "0".repeat(64), "d".repeat(64)],
    );
  });

  it("while failures from before the removal are still inside the window, lists only those", async () => {
    await audits(30, 8 * 24 * 60, false); // older than 7 days: outside
    await audits(6, 70, false); // the last 6 before the record went, from 70 minutes ago
    let answer = await body();
    expect(answer.self_audit).toMatchObject({ lookback_days: 7, total: 6, passed: 0, failed: 6, has_auditable_draws: false });
    expect(answer.self_audit.recent_failures).toHaveLength(6);
    const ages = answer.self_audit.recent_failures.map((f: { run_at: string }) => Date.now() - Date.parse(f.run_at));
    expect(Math.max(...ages)).toBeLessThan(7 * 86_400_000);

    await audits(20, 100, false);
    answer = await body();
    expect(answer.self_audit).toMatchObject({ total: 26, failed: 26 });
    expect(answer.self_audit.recent_failures).toHaveLength(10);
    expect(JSON.stringify(answer)).not.toContain("subject_id");
    expect(answer.digest).toMatchObject({ total: 1, last_7d: 0, last_24h: 0, has_undigested_draws: false });
  });

  it("once the window holds only older rows, reports nothing in it, failures included", async () => {
    await audits(30, 8 * 24 * 60, false);
    const answer = await body();
    expect(answer.self_audit).toMatchObject({ total: 0, passed: 0, failed: 0, recent_failures: [], daily_series: [], has_auditable_draws: false });
    expect(answer.digest.has_undigested_draws).toBe(false);
  });

  it("says a draw is waiting or auditable only for the rows the jobs would take", async () => {
    // A revealed pull with no seed or rarity: the digest job takes it, the self-audit does not.
    await pool.query(`INSERT INTO bounty_pulls (id, revealed_at) VALUES ($1, NOW())`, [randomUUID()]);
    expect(await body()).toMatchObject({ digest: { has_undigested_draws: true }, self_audit: { has_auditable_draws: false } });

    // A draw without weight_order in its outcome is not one the self-audit samples.
    await pool.query("TRUNCATE bounty_pulls");
    await pool.query(
      `INSERT INTO verifiable_draws (id, commitment, server_seed, outcome, revealed_at, merkle_digest_id)
       VALUES ($1, 'x', 'y', '{"picked":"a"}', NOW(), (SELECT id FROM fairness_digests LIMIT 1))`,
      [randomUUID()],
    );
    expect(await body()).toMatchObject({ digest: { has_undigested_draws: false }, self_audit: { has_auditable_draws: false } });

    await pool.query(`UPDATE verifiable_draws SET outcome = '{"picked":"a","weight_order":["a"]}'`);
    expect(await body()).toMatchObject({ digest: { has_undigested_draws: false }, self_audit: { has_auditable_draws: true } });

    await pool.query(
      `INSERT INTO bounty_pulls (id, rng_server_seed, rolled_rarity, revealed_at) VALUES ($1, 'z', 'R', NOW())`,
      [randomUUID()],
    );
    expect(await body()).toMatchObject({ digest: { has_undigested_draws: true }, self_audit: { has_auditable_draws: true } });
  });
});
