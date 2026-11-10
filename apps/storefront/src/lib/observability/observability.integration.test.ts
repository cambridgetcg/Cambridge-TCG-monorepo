import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createDb } from "@cambridge-tcg/db";

vi.mock("server-only", () => ({}));
import { recordJobOutcome } from "./job-outcomes";
import { recordMcpDaily } from "./mcp-daily";
import { loadMonitor, type RunQuery } from "./monitor";
import { pruneObservability, runObservabilityRetentionSweep } from "./retention";

// Explicit opt-in, like the other storefront integration tests: one
// disposable loopback database, isolated schemas, never DATABASE_URL.
const localUrl = process.env.OPS_TEST_DATABASE_URL;
const id = randomUUID().replaceAll("-", "");
const schema = `ops_observability_test_${id}`, alone = `ops_observability_alone_${id}`;
const migration = (name: string) => readFile(new URL(`../../../drizzle/${name}`, import.meta.url), "utf8");
let admin: Pool, pool: Pool, postgresJs: ReturnType<typeof createDb> | null = null;
const run: RunQuery = (sql, params) => pool.query(sql, params) as never;
async function apply(target: Pool, name: string) {
  const client = await target.connect();
  try { await client.query("BEGIN"); await client.query(await migration(name)); await client.query("COMMIT"); }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
async function inTransaction(statements: [string, unknown[]?][]) {
  const client = await pool.connect();
  try { await client.query("BEGIN"); for (const [sql, params] of statements) await client.query(sql, params); await client.query("COMMIT"); }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
// One instant for the dates these tests write and the monitor reads them at,
// so a run that crosses midnight or the hour (UTC) still agrees with itself.
const now = new Date();
const today = now.toISOString().slice(0, 10);
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
const hourAgo = (hours: number) => new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000 - hours * 3_600_000).toISOString();

describe.skipIf(!localUrl)("ops observability PostgreSQL integration, migration 0148 (explicit loopback DB only)", () => {
  beforeAll(async () => {
    const url = new URL(localUrl!);
    if (!["127.0.0.1", "[::1]"].includes(url.hostname) || !url.pathname.includes("test") || url.search) throw new Error("Explicit disposable local test database required");
    admin = new Pool({ connectionString: localUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`CREATE SCHEMA ${alone}`);
    pool = new Pool({ connectionString: localUrl, options: `-c search_path=${schema}`, max: 6 });
    await pool.query("CREATE TABLE users (id uuid PRIMARY KEY)");
    for (const name of ["0090_agents.sql", "0137_member_price_observations.sql", "0138_member_data_keys.sql", "0139_widen_price_sources.sql", "0140_price_source_crosswalks.sql",
      "0141_market_derived.sql", "0142_data_api_plans.sql", "0143_price_collector_leases.sql", "0146_price_collector_hosts.sql", "0148_ops_observability.sql",
      "0150_mcp_daily_agent_revoke_key.sql", "0151_agent_key_expiry.sql"]) await apply(pool, name);
  });
  afterAll(async () => {
    if (postgresJs) await postgresJs.close();
    if (pool) await pool.end();
    if (admin) { for (const name of [schema, alone]) await admin.query(`DROP SCHEMA IF EXISTS ${name} CASCADE`); await admin.end(); }
  });

  it("is additive: applies in one transaction on its own, and names no table it does not create", async () => {
    const bare = new Pool({ connectionString: localUrl, options: `-c search_path=${alone}`, max: 1 });
    try {
      await apply(bare, "0148_ops_observability.sql");
      const tables = (await bare.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY 1`, [alone])).rows.map(row => row.table_name);
      expect(tables).toEqual(["error_daily", "mcp_daily", "ops_job_outcomes", "traffic_hourly", "traffic_pulls"]);
      // No column could hold an address, an agent string, a key or an account.
      const columns = (await bare.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = $1`, [alone])).rows.map(row => row.column_name);
      for (const column of columns) expect(column).not.toMatch(/ip|user|agent|key|account|session|referr|query|path$|body|message/);
    } finally { await bare.end(); }
    const sql = await migration("0148_ops_observability.sql");
    expect(sql).not.toMatch(/\b(ALTER|DROP|DELETE|UPDATE|INSERT|TRUNCATE)\b/);
  });

  it("0150 adds agent.revoke_key to mcp_daily.tool, keeps every row and word 0148 allowed, and re-applies harmlessly", async () => {
    const own = `ops_observability_0150_${id}`;
    await admin.query(`CREATE SCHEMA ${own}`);
    const bare = new Pool({ connectionString: localUrl, options: `-c search_path=${own}`, max: 1 });
    const row = (tool: string, count: number) => `INSERT INTO mcp_daily VALUES (current_date, 'tools/call', '${tool}', false, 'ok', ${count})`;
    try {
      await apply(bare, "0148_ops_observability.sql");
      await bare.query(row("agent.self", 2));
      await expect(bare.query(row("agent.revoke_key", 1))).rejects.toMatchObject({ code: "23514" });
      await apply(bare, "0150_mcp_daily_agent_revoke_key.sql");
      await bare.query(row("agent.revoke_key", 1));
      await bare.query(row("coverage.hunt.my_cases", 1));
      await expect(bare.query(row("secret.tool", 1))).rejects.toMatchObject({ code: "23514" });
      await expect(bare.query(`INSERT INTO mcp_daily VALUES (current_date, 'tools/list', 'agent.revoke_key', false, 'ok', 1)`)).rejects.toMatchObject({ code: "23514" });
      // The runner records it and never applies it twice; if it were, the
      // same constraint is dropped and re-added and every row stays.
      await apply(bare, "0150_mcp_daily_agent_revoke_key.sql");
      expect((await bare.query(`SELECT tool, count FROM mcp_daily ORDER BY tool`)).rows).toEqual([
        { tool: "agent.revoke_key", count: 1 }, { tool: "agent.self", count: 2 }, { tool: "coverage.hunt.my_cases", count: 1 },
      ]);
      expect((await bare.query(`SELECT conname FROM pg_constraint WHERE conrelid = 'mcp_daily'::regclass AND contype = 'c' ORDER BY 1`)).rows.map(r => r.conname))
        .toEqual(["mcp_daily_check", "mcp_daily_count_check", "mcp_daily_method_check", "mcp_daily_outcome_check", "mcp_daily_tool_check"]);
    } finally {
      await bare.end();
      await admin.query(`DROP SCHEMA IF EXISTS ${own} CASCADE`);
    }
    expect(await migration("0150_mcp_daily_agent_revoke_key.sql")).not.toMatch(/\b(DELETE|UPDATE|INSERT|TRUNCATE|BEGIN|COMMIT)\b|DROP TABLE/);
  });

  it("refuses malformed rows: words outside the lists, text, prices, raw paths, overlapping counts", async () => {
    const refused = async (sql: string, code = "23514") => expect(pool.query(sql)).rejects.toMatchObject({ code });
    const job = (columns: string) => `INSERT INTO ops_job_outcomes (job, started_at, finished_at, http_status, outcome, counts) VALUES (${columns})`;
    await refused(job(`'Collect Cardrush', now(), now(), 200, 'ran', '{}'`));
    await refused(job(`'collect/cardrush', now(), now(), 99, 'ran', '{}'`));
    await refused(job(`'collect/cardrush', now(), now(), 200, 'ok', '{}'`));
    await refused(job(`'collect/cardrush', now(), now(), 200, 'refused:Too Many Requests', '{}'`));
    await refused(job(`'collect/cardrush', now(), now() - interval '1 second', 200, 'ran', '{}'`));
    await refused(job(`'collect/cardrush', now() - interval '2 hours', now(), 200, 'ran', '{}'`));
    for (const counts of [`'[]'`, `'{"amount":8.22}'`, `'{"n":-1}'`, `'{"error":"relation users does not exist"}'`, `'{"a":{"b":{"c":1}}}'`, `'{"hosts":["a"]}'`, `'{"bad key":1}'`]) {
      await refused(job(`'derive/market', now(), now(), 200, 'ran', ${counts}`));
    }
    const mcp = (values: string) => `INSERT INTO mcp_daily (day, method, tool, authenticated, outcome, count) VALUES (${values})`;
    await refused(mcp(`current_date, 'eval', 'none', false, 'ok', 1`));
    await refused(mcp(`current_date, 'tools/call', 'secret.tool', true, 'ok', 1`));
    await refused(mcp(`current_date, 'tools/list', 'agent.self', false, 'ok', 1`));
    await refused(mcp(`current_date, 'tools/list', 'none', false, 'teapot', 1`));
    await refused(mcp(`current_date, 'tools/list', 'none', false, 'ok', 0`));
    const hourly = (values: string) => `INSERT INTO traffic_hourly (hour, host_class, path_group, rsc, actor_class, classifier_version, status_class, cache_result, waf_action, count) VALUES (${values})`;
    await refused(hourly(`date_trunc('hour', now()) + interval '1 minute', 'apex', '/', false, 'browser-like', 'ctcg.actor-class/v1', '2xx', 'miss', 'none', 1`));
    await refused(hourly(`date_trunc('hour', now()), 'apex', '/product/op-op01-001-ja', false, 'browser-like', 'ctcg.actor-class/v1', '2xx', 'miss', 'none', 1`));
    await refused(hourly(`date_trunc('hour', now()), 'apex', '/', false, 'human', 'ctcg.actor-class/v1', '2xx', 'miss', 'none', 1`));
    await refused(hourly(`date_trunc('hour', now()), 'apex', '/', false, 'browser-like', 'ctcg.actor-class/v2', '2xx', 'miss', 'none', 1`));
    await refused(hourly(`date_trunc('hour', now()), 'apex', '/', false, 'browser-like', 'ctcg.actor-class/v1', '418', 'miss', 'none', 1`));
    await refused(hourly(`date_trunc('hour', now()), '203.0.113.9', '/', false, 'browser-like', 'ctcg.actor-class/v1', '2xx', 'miss', 'none', 1`));
    const pull = (values: string) => `INSERT INTO traffic_pulls (window_start, window_end, status, records, pages, error_code) VALUES (${values})`;
    await refused(pull(`date_trunc('hour', now()) + interval '5 minutes', date_trunc('hour', now()) + interval '1 hour', 'ok', 1, 1, NULL`));
    await refused(pull(`date_trunc('hour', now()) - interval '25 hours', date_trunc('hour', now()), 'ok', 1, 1, NULL`));
    await refused(pull(`date_trunc('hour', now()) - interval '1 hour', date_trunc('hour', now()), 'ok', 1, 1, 'http-500'`));
    await refused(pull(`date_trunc('hour', now()) - interval '1 hour', date_trunc('hour', now()), 'partial', 1, 1, 'Page 3 failed'`));
    // These three name the same hour, read once: each statement's own now() can sit either side of an hour.
    await pool.query(pull(`'${hourAgo(30)}', '${hourAgo(29)}', 'ok', 10, 1, NULL`));
    // A counted hour is never counted again; a failed pull counted nothing and may be retried.
    await refused(pull(`'${hourAgo(30)}', '${hourAgo(28)}', 'partial', 3, 1, 'page-failed'`), "23P01");
    await pool.query(pull(`'${hourAgo(30)}', '${hourAgo(29)}', 'failed', 0, 0, 'http-500'`));
    await refused(`INSERT INTO error_daily (day, tag, status, count) VALUES (current_date, 'relation users does not exist', 500, 1)`);
    await refused(`INSERT INTO error_daily (day, tag, status, count) VALUES (current_date, 'wholesale', 99, 1)`);
    await pool.query(`DELETE FROM traffic_pulls`);
  });

  it("records a job outcome and sweeps every table's rows past retention, keeping the rest", async () => {
    await pool.query(`INSERT INTO ops_job_outcomes (job, started_at, finished_at, http_status, outcome) VALUES ('collect/tcgplayer', now() - interval '14 months', now() - interval '14 months', 200, 'ran'),
      ('collect/tcgplayer', now() - interval '12 months', now() - interval '12 months', 200, 'ran')`);
    await pool.query(`INSERT INTO mcp_daily VALUES (current_date - 400, 'tools/list', 'none', false, 'ok', 3), (current_date - 300, 'tools/list', 'none', false, 'ok', 2)`);
    // Dated from `today`: the 30-day-old row must stay outside the 30 days the monitor reads at `now`.
    await pool.query(`INSERT INTO error_daily VALUES ($1::date - 400, 'wholesale', 503, 9), ($1::date - 30, 'wholesale', 503, 4)`, [today]);
    await pool.query(`INSERT INTO traffic_hourly VALUES (date_trunc('hour', now()) - interval '36 days', 'apex', '/', false, 'browser-like', 'ctcg.actor-class/v1', '2xx', 'miss', 'none', 5),
      (date_trunc('hour', now()) - interval '34 days', 'apex', '/', false, 'browser-like', 'ctcg.actor-class/v1', '2xx', 'miss', 'none', 6)`);
    await pool.query(`INSERT INTO traffic_pulls (window_start, window_end, status, records, pages) VALUES (date_trunc('hour', now()) - interval '36 days', date_trunc('hour', now()) - interval '36 days' + interval '1 hour', 'ok', 5, 1)`);
    const loaded = await loadMonitor(run, new Date());
    expect(loaded.retention).toMatchObject({ state: "known", data: expect.arrayContaining([
      expect.objectContaining({ table: "traffic_hourly", keeps: "35 days", rows: 2, expired: 1 }),
      expect.objectContaining({ table: "mcp_daily", keeps: "13 months", rows: 2, expired: 1 }),
    ]) });

    expect(await recordJobOutcome({ job: "derive/market", startedAt: new Date(Date.now() - 41_000), httpStatus: 503, outcome: "refused:no-inputs",
      counts: { asOf: daysAgo(1), excludedSources: { cardmarket: "derivation-off" }, note: "free text is dropped" } }, run)).toEqual({ recorded: true });
    const counts = async (table: string) => (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
    expect({ ops: await counts("ops_job_outcomes"), mcp: await counts("mcp_daily"), errors: await counts("error_daily"), hourly: await counts("traffic_hourly"), pulls: await counts("traffic_pulls") })
      .toEqual({ ops: 2, mcp: 1, errors: 1, hourly: 1, pulls: 0 });
    const row = (await pool.query(`SELECT outcome, counts FROM ops_job_outcomes WHERE job = 'derive/market'`)).rows[0];
    expect(row).toEqual({ outcome: "refused:no-inputs", counts: { asOf: daysAgo(1), excludedSources: { cardmarket: "derivation-off" } } });
    expect(await pruneObservability(run)).toEqual({ ops_job_outcomes: 0, mcp_daily: 0, traffic_hourly: 0, traffic_pulls: 0, error_daily: 0 });
  });

  it("sweeps every table hourly at minute 23 with no writer running, and finds nothing to sweep before 0148", async () => {
    await pool.query(`INSERT INTO traffic_hourly VALUES (date_trunc('hour', now()) - interval '40 days', 'apex', '/', false, 'browser-like', 'ctcg.actor-class/v1', '2xx', 'miss', 'none', 5)`);
    await pool.query(`INSERT INTO traffic_pulls (window_start, window_end, status, records, pages, error_code) VALUES (date_trunc('hour', now()) - interval '40 days', date_trunc('hour', now()) - interval '40 days' + interval '1 hour', 'skipped', 0, 0, 'before-start')`);
    await pool.query(`INSERT INTO error_daily VALUES (current_date - 420, 'cron', 500, 2)`);
    const at = (minute: number) => { const date = new Date(); date.setUTCMinutes(minute); return date; };
    expect(await runObservabilityRetentionSweep(at(22), run)).toEqual({ ranInWindow: false });
    expect(await runObservabilityRetentionSweep(at(23), run)).toEqual({ ranInWindow: true, provisioned: true,
      deleted: { ops_job_outcomes: 0, mcp_daily: 0, traffic_hourly: 1, traffic_pulls: 1, error_daily: 1 } });
    const bare = new Pool({ connectionString: localUrl, options: `-c search_path=public`, max: 1 });
    try {
      expect(await runObservabilityRetentionSweep(at(23), (sql, params) => bare.query(sql, params) as never)).toEqual({ ranInWindow: true, provisioned: false });
    } finally { await bare.end(); }
  });

  it("adds each count to its day's MCP row, many rows in one statement", async () => {
    const words = { method: "tools/call", tool: "agent.self", authenticated: true, outcome: "ok" } as const;
    const today = (await pool.query(`SELECT ((now() AT TIME ZONE 'UTC')::date)::text AS day`)).rows[0].day as string;
    expect(await recordMcpDaily([{ day: today, ...words, count: 2 }], run)).toBe(true);
    expect(await recordMcpDaily([{ day: today, ...words, count: 1 }, { day: today, ...words, outcome: "rate-limited", count: 1 }], run)).toBe(true);
    expect((await pool.query(`SELECT method, tool, authenticated, outcome, count FROM mcp_daily WHERE day = $1::date ORDER BY outcome`, [today])).rows).toEqual([
      { ...words, count: 3 }, { ...words, outcome: "rate-limited", count: 1 },
    ]);
  });

  it("reads every panel from a real schema, through pg and postgres.js alike, with counts only", async () => {
    const userId = randomUUID(), agentId = randomUUID();
    await pool.query(`INSERT INTO users (id) VALUES ($1)`, [userId]);
    await pool.query(`INSERT INTO agents (id, operated_by_user_id, public_handle, display_name, model_tag) VALUES ($1, $2, 'scout-one', 'Scout', 'model-x')`, [agentId, userId]);
    const keys = (await pool.query(`INSERT INTO agent_keys (agent_id, key_hash, key_prefix, last_used_at, revoked_at) VALUES
      ($1, repeat('a', 64), 'ctcg_agt_aaaa', now() - interval '10 minutes', NULL),
      ($1, repeat('b', 64), 'ctcg_agt_bbbb', now() - interval '3 days', NULL),
      ($1, repeat('c', 64), 'ctcg_agt_cccc', NULL, NULL),
      ($1, repeat('d', 64), 'ctcg_agt_dddd', now() - interval '40 days', now()) RETURNING id`, [agentId])).rows.map(row => row.id);
    // Used two days ago, expired yesterday (0151): not active, so not in a band.
    await pool.query(`INSERT INTO agent_keys (agent_id, key_hash, key_prefix, last_used_at, created_at, expires_at)
      VALUES ($1, repeat('e', 64), 'ctcg_agt_eeee', now() - interval '2 days', now() - interval '10 days', now() - interval '1 day')`, [agentId]);
    // Two minutes of one UTC day, the last two of yesterday: now()'s minute and
    // the one before it fall on two days in the first minute after midnight.
    await pool.query(`INSERT INTO agent_rate_buckets (key_id, bucket_minute, request_count) VALUES
      ($1, date_trunc('day', now(), 'UTC') - interval '1 minute', 7), ($2, date_trunc('day', now(), 'UTC') - interval '2 minutes', 2)`, [keys[0], keys[1]]);
    await pool.query(`INSERT INTO data_api_usage_months (user_id, month, request_count) VALUES ($1, date_trunc('month', now() AT TIME ZONE 'UTC')::date, 41)`, [userId]);
    await inTransaction([
      ["SELECT pg_advisory_xact_lock(137, 1)"],
      [`INSERT INTO member_price_batches (ingest_key, source, source_rows, missing_prices, quarantine) VALUES ($1, 'cardrush', 103, 2, '[{"sourceProductId":"x","field":"price","reason":"unparseable price text"}]')`, [`cardrush:www.cardrush-op.jp:${new Date().toISOString()}`]],
    ]);
    await pool.query(`INSERT INTO price_collector_hosts (source, host, consecutive_refusals, last_refusal_at, last_refusal_reason, not_before, suspended_at, suspended_reason, updated_at)
      VALUES ('cardrush', 'www.cardrush-pokemon.jp', 3, now() - interval '1 day', 'http-403', now() + interval '6 hours', now() - interval '1 day', 'http-403', now())`);
    await pool.query(`INSERT INTO price_collector_leases (lease_key, holder, acquired_at, expires_at) VALUES ('cardrush:www.cardrush-op.jp', 'request-spacing', now() - interval '1 second', now() + interval '1 second')`);
    const fx = JSON.stringify({ JPY: { rate: "187.419280442804", source: "ecb.europa.eu", as_of: daysAgo(1) }, USD: { rate: "1.245387453875", source: "ecb.europa.eu", as_of: daysAgo(1) } });
    await inTransaction([
      [`INSERT INTO market_derivation_runs (method_version, as_of, input_batch_ceiling, input_evidence, fx) VALUES ('ctcg.market-derived/v1', $1::date, 1, '{"cardrush":"cardrush/2026-10-28.1","tcgplayer":"tcgplayer/2026-10-28.1"}', $2::jsonb)`, [today, fx]],
      [`INSERT INTO market_indices (run_id, method_version, as_of, game, set_code, market, level, constituents, previous_as_of, sources)
        SELECT id, method_version, as_of, 'one-piece', 'op01', 'cardrush', 100, 12, NULL, ARRAY['cardrush'] FROM market_derivation_runs WHERE as_of = $1::date`, [today]],
      [`INSERT INTO market_reference_prices (run_id, method_version, as_of, sku, game, set_code, amount, currency, confidence, sources, source_count)
        SELECT id, method_version, as_of, 'op-op01-001-en', 'one-piece', 'op01', 8.22, 'GBP', 'medium', ARRAY['cardrush','tcgplayer'], 2 FROM market_derivation_runs WHERE as_of = $1::date`, [today]],
      [`INSERT INTO market_premiums (run_id, method_version, as_of, game, set_code, market, base_market, ratio_p25, ratio_median, ratio_p75, sku_count, sources, market_languages, base_languages)
        SELECT id, method_version, as_of, 'one-piece', 'op01', 'tcgplayer', 'cardrush', 1.2, 1.4, 1.6, 10, ARRAY['cardrush','tcgplayer'], ARRAY['en'], ARRAY['ja'] FROM market_derivation_runs WHERE as_of = $1::date`, [today]],
    ]);
    await pool.query(`INSERT INTO traffic_pulls (window_start, window_end, status, records, pages, error_code) VALUES ($1, $2, 'ok', 120, 2, NULL), ($2, $3, 'failed', 0, 0, 'http-402')`, [hourAgo(3), hourAgo(2), hourAgo(1)]);
    await pool.query(`INSERT INTO traffic_hourly VALUES
      ($1, 'apex', '/product/[sku]', true, 'browser-like-fleet', 'ctcg.actor-class/v1', '2xx', 'miss', 'none', 80),
      ($1, 'apex', '/market/[sku]', false, 'ai-training-crawler', 'ctcg.actor-class/v1', '404', 'miss', 'none', 15),
      ($1, 'prod-alias', '/api/v1/member-prices', false, 'library', 'ctcg.actor-class/v1', '401', 'none', 'none', 5)`, [hourAgo(3)]);
    await pool.query(`INSERT INTO error_daily VALUES (current_date, 'fairness-audit', 200, 60)`);

    // The page reads through sfQuery (postgres.js client.unsafe); the tests
    // above through pg. Both drivers must read the same panels.
    const url = new URL(localUrl!);
    url.searchParams.set("search_path", schema);
    postgresJs = createDb({ url: url.toString(), ssl: false, max: 2 });
    const unsafe: RunQuery = async (sql, params) => ({ rows: await postgresJs!.client.unsafe(sql, (params ?? []) as never[]) as unknown as Record<string, unknown>[] });
    for (const [driver, read] of [["pg", run], ["postgres.js", unsafe]] as const) {
      const data = await loadMonitor(read, now);
      const label = `${driver}: `;
      expect(data.collectors.batches, label).toMatchObject({ state: "known", data: { window: [{ source: "cardrush", host: "www.cardrush-op.jp", batches: 1, sourceRows: 103, missingPrices: 2, quarantined: 1 }] } });
      const cardrush = data.collectors.sources.find(source => source.source === "cardrush")!;
      expect(cardrush.hosts.hosts.find(host => host.host === "www.cardrush-pokemon.jp"), label).toMatchObject({ state: "suspended", suspended_reason: "http-403" });
      expect(data.collectors.leases, label).toMatchObject({ state: "known", data: [{ leaseKey: "cardrush:www.cardrush-op.jp", spacing: true }] });
      expect(data.collectors.jobs, label).toMatchObject({ state: "known", data: { latest: expect.arrayContaining([expect.objectContaining({ job: "derive/market", outcome: "refused:no-inputs", httpStatus: 503 })]) } });
      expect(data.derivation.state, label).toBe("known");
      if (data.derivation.state === "known") {
        expect(data.derivation.data.days[0], label).toMatchObject({ asOf: today, state: "ran", run: { sources: ["cardrush", "tcgplayer"], fxDates: { JPY: daysAgo(1), USD: daysAgo(1) }, written: { references: 1, indices: 1, premiums: 1 } } });
        expect(data.derivation.data.days[1], label).toMatchObject({ asOf: daysAgo(1), state: "refused:no-inputs" });
        expect(data.derivation.data.counts, label).toEqual([
          { kind: "index", game: "one-piece", market: "cardrush", detail: "per set", rows: 1 },
          { kind: "premium", game: "one-piece", market: "tcgplayer / cardrush", detail: "per set", rows: 1 },
          { kind: "reference", game: "one-piece", market: "all sources", detail: "medium", rows: 1 },
        ]);
      }
      expect(data.api.usage, label).toMatchObject({ state: "known", data: [{ requests: 41, accounts: 1 }] });
      expect(data.api.routes, label).toMatchObject({ state: "known", data: [{ pathGroup: "/api/v1/member-prices", statusClass: "401", requests: 5 }] });
      expect(data.agents.mcp, label).toMatchObject({ state: "known", data: { tally: expect.arrayContaining([{ method: "tools/call", tool: "agent.self", authenticated: true, outcome: "ok", requests: 3 }]) } });
      expect(data.agents.keys, label).toEqual({ state: "known", data: { keys: 5, active: 3, never: 1, lastHour: 1, lastDay: 0, lastWeek: 1, lastMonth: 0, older: 0 } });
      expect(data.agents.buckets, label).toMatchObject({ state: "known", data: [{ requests: 9, keys: 2, busiestMinute: 7 }] });
      expect(data.traffic.coverage, label).toMatchObject({ state: "known", data: { ok: 1, failed: 1, partial: 0, unknown: 35 * 24 - 2 } });
      expect(data.traffic.counts, label).toMatchObject({ state: "known", data: {
        days: [{ requests: 100, rsc: 80, direct: 5, statuses: { "2xx": 80, "404": 15, "401": 5 } }],
        notFound: [{ pathGroup: "/market/[sku]", notFound: 15, requests: 15 }],
      } });
      expect(data.errors, label).toMatchObject({ state: "known", data: [{ tag: "fairness-audit", status: 200, count: 60 }] });
      // Nothing that names a key, an agent, an account or a price leaves the readers.
      const text = JSON.stringify(data);
      for (const leak of [...keys, agentId, userId, "scout-one", "ctcg_agt_", "187.419280442804", "unparseable price text"]) expect(text, `${label}${leak}`).not.toContain(leak);
      expect(text, label).not.toMatch(/"(amount|level|ratio_[a-z0-9]+|rate|key_id|holder)":/);
    }
  });
});
