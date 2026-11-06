import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createCompatDb } from "@cambridge-tcg/db/compat";

vi.mock("server-only", () => ({}));
import { readErrors, readTraffic, readTrafficCoverage, type RunQuery } from "@/lib/observability/monitor";
import { COUNTED_PULLS_SQL, runTrafficPull } from "./pull";

// Explicit opt-in, like the other storefront integration tests: one
// disposable loopback database, an isolated schema, never DATABASE_URL.
const localUrl = process.env.OPS_TEST_DATABASE_URL;
const schema = `traffic_pull_test_${randomUUID().replaceAll("-", "")}`;
const HOUR = 3_600_000;
let admin: Pool, pool: Pool, compat: ReturnType<typeof createCompatDb> | null = null;

const pgQuery: RunQuery = (sql, params) => pool.query(sql, params) as never;
async function pgTransaction<T>(work: (tx: RunQuery) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work((sql, params) => client.query(sql, params) as never);
    await client.query("COMMIT");
    return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
/** Vercel for one test: each hour's request records and error lines, by window start. */
function vercel(byHour: Record<string, { requests: Record<string, unknown>[]; runtime?: Record<string, unknown>[] } | Response>) {
  return vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String(init!.body)) as { event: string; timeRange: { start: string } };
    const entry = byHour[body.timeRange.start];
    if (entry instanceof Response) return entry.clone();
    const events = body.event === "vercel.log" ? entry?.runtime ?? [] : entry?.requests ?? [];
    return new Response(JSON.stringify({ events, pagination: { hasMore: false, nextCursor: null } }), { status: 200 });
  });
}
const hourStart = (hoursAgo: number) => Math.floor(Date.now() / HOUR) * HOUR - hoursAgo * HOUR;
const iso = (at: number) => new Date(at).toISOString();
function hourOf(hoursAgo: number) {
  const start = hourStart(hoursAgo), at = iso(start + 10 * 60_000);
  const countries = ["US", "SG", "JP", "DE", "BR", "HK"];
  return {
    requests: [
      ...countries.map((country, i) => ({ timestamp: at, requestId: `${hoursAgo}-f${i}`, requestHostname: "cambridgetcg.com", requestPath: `/product/sku-${i}`, route: "/product/[sku].rsc", httpStatus: 200, cacheResult: "MISS", wafAction: "allow", clientUserAgent: CHROME, clientIpCountry: country })),
      { timestamp: at, requestId: `${hoursAgo}-c`, requestHostname: "cambridgetcg-storefront-abc123-cambridgetcgs-projects.vercel.app", requestPath: "/api/cron/maintenance", route: "/api/cron/maintenance", httpStatus: 200, cacheResult: "BYPASS", wafAction: "allow", clientUserAgent: "vercel-cron/1.0", clientIpCountry: "US" },
      { timestamp: at, requestId: `${hoursAgo}-p`, requestHostname: "cambridgetcg.com", requestPath: "/.env", route: "/_not-found", httpStatus: 404, cacheResult: "MISS", wafAction: "allow", clientUserAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", clientIpCountry: "NL" },
    ],
    runtime: [
      { timestamp: at, requestId: `${hoursAgo}-f0`, level: "error", message: "[wholesale] price-sources error 503" },
      { timestamp: at, requestId: `${hoursAgo}-c`, level: "error", message: "[fairness-audit] CRITICAL FAILURE source=bounty_pull" },
    ],
  };
}
const count = async (sql: string, params: unknown[] = []) => Number((await pool.query(sql, params)).rows[0].n);

describe.skipIf(!localUrl)("traffic pull PostgreSQL integration, migration 0148 (explicit loopback DB only)", () => {
  beforeAll(async () => {
    const url = new URL(localUrl!);
    if (!["127.0.0.1", "[::1]"].includes(url.hostname) || !url.pathname.includes("test") || url.search) throw new Error("Explicit disposable local test database required");
    admin = new Pool({ connectionString: localUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: localUrl, options: `-c search_path=${schema}`, max: 4 });
    const migration = await readFile(new URL("../../../drizzle/0148_ops_observability.sql", import.meta.url), "utf8");
    const client = await pool.connect();
    try { await client.query("BEGIN"); await client.query(migration); await client.query("COMMIT"); }
    finally { client.release(); }
  });
  afterAll(async () => {
    if (compat) await compat.close();
    if (pool) await pool.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
  });

  it("counts the previous hour once, through the database's own checks, and the monitor reads it", async () => {
    const fetch = vercel({ [iso(hourStart(1))]: hourOf(1) });
    const report = await runTrafficPull({ query: pgQuery, transaction: pgTransaction, fetch, token: "test-token-not-real" });
    expect(report).toMatchObject({ ran: true, stoppedBy: null, hours: [{ hour: iso(hourStart(1)), status: "ok", records: 8, rows: 3, errors: 2 }] });

    expect((await pool.query(`SELECT host_class, path_group, rsc, actor_class, status_class, cache_result, waf_action, count FROM traffic_hourly ORDER BY actor_class`)).rows).toEqual([
      { host_class: "apex", path_group: "/product/[sku]", rsc: true, actor_class: "browser-like-fleet", status_class: "2xx", cache_result: "miss", waf_action: "none", count: 6 },
      { host_class: "deploy-url", path_group: "/api/cron/*", rsc: false, actor_class: "cron-self", status_class: "2xx", cache_result: "bypass", waf_action: "none", count: 1 },
      { host_class: "apex", path_group: "(other page)", rsc: false, actor_class: "probe", status_class: "404", cache_result: "miss", waf_action: "none", count: 1 },
    ]);
    expect((await pool.query(`SELECT tag, status, count FROM error_daily ORDER BY tag`)).rows).toEqual([
      { tag: "fairness-audit", status: 200, count: 1 }, { tag: "wholesale", status: 200, count: 1 },
    ]);
    expect((await pool.query(`SELECT status, records, pages, error_code FROM traffic_pulls`)).rows).toEqual([{ status: "ok", records: 8, pages: 2, error_code: null }]);

    // Again: the hour is counted, so Vercel is not asked and nothing doubles.
    const again = vercel({});
    expect(await runTrafficPull({ query: pgQuery, transaction: pgTransaction, fetch: again, token: "test-token-not-real" })).toMatchObject({ ran: true, hours: [] });
    expect(again).not.toHaveBeenCalled();
    expect(await count(`SELECT sum(count)::int AS n FROM traffic_hourly`)).toBe(8);

    // A run that read the coverage before another run wrote it is refused by
    // 0148's exclusion constraint, and its transaction leaves nothing behind.
    const stale: RunQuery = (sql, params) => sql === COUNTED_PULLS_SQL ? Promise.resolve({ rows: [{ first_start: new Date(hourStart(1)), window_start: null, window_end: null }] }) : pgQuery(sql, params);
    expect(await runTrafficPull({ query: stale, transaction: pgTransaction, fetch: vercel({ [iso(hourStart(1))]: hourOf(1) }), token: "test-token-not-real" }))
      .toMatchObject({ hours: [{ status: "already-counted" }] });
    expect(await count(`SELECT sum(count)::int AS n FROM traffic_hourly`)).toBe(8);
    expect(await count(`SELECT sum(count)::int AS n FROM error_daily`)).toBe(2);
    expect(await count(`SELECT count(*)::int AS n FROM traffic_pulls`)).toBe(1);

    const now = new Date();
    expect(await readTrafficCoverage(pgQuery, now)).toMatchObject({ state: "known", data: { ok: 1, failed: 0, partial: 0 } });
    expect(await readTraffic(pgQuery, now)).toMatchObject({ state: "known", data: { days: [{ requests: 8, rsc: 6, direct: 1, statuses: { "2xx": 7, "404": 1 } }] } });
    expect(await readErrors(pgQuery, now)).toMatchObject({ state: "known", data: expect.arrayContaining([expect.objectContaining({ tag: "wholesale", status: 200, count: 1 })]) });
    // No column holds what a record carried.
    let everything = "";
    for (const table of ["traffic_hourly", "traffic_pulls", "error_daily"]) everything += JSON.stringify((await pool.query(`SELECT * FROM ${table}`)).rows);
    for (const fragment of ["Mozilla", "Googlebot", "sku-", ".env", "vercel.app", "\"US\"", "price-sources", "bounty_pull", "-f0"]) expect(everything).not.toContain(fragment);
  });

  it("back-fills missed hours through postgres.js, records a refused one as failed, and sweeps past retention", async () => {
    await pool.query(`INSERT INTO traffic_hourly VALUES ($1, 'apex', '/', false, 'browser-like', 'ctcg.actor-class/v1', '2xx', 'miss', 'none', 4)`, [iso(hourStart(36 * 24))]);
    await pool.query(`INSERT INTO error_daily VALUES ((now() AT TIME ZONE 'UTC')::date - 400, 'wholesale', 503, 9)`);
    // The first pull ran four hours ago and failed; hours 3 and 2 were never tried.
    await pool.query(`INSERT INTO traffic_pulls (window_start, window_end, status, records, pages, error_code) VALUES ($1, $2, 'failed', 0, 0, 'http-503')`, [iso(hourStart(4)), iso(hourStart(3))]);

    const url = new URL(localUrl!);
    url.searchParams.set("search_path", schema);
    compat = createCompatDb({ url: url.toString(), ssl: false, max: 2 });
    const fetch = vercel({
      [iso(hourStart(4))]: hourOf(4), [iso(hourStart(3))]: hourOf(3),
      [iso(hourStart(2))]: new Response("", { status: 402 }),
    });
    const report = await runTrafficPull({ query: compat.query as RunQuery, transaction: compat.transaction as never, fetch, token: "test-token-not-real" });
    expect(report).toMatchObject({
      ran: true, stoppedBy: null, pending: 0,
      hours: [
        { hour: iso(hourStart(4)), status: "ok", records: 8 },
        { hour: iso(hourStart(3)), status: "ok", records: 8 },
        { hour: iso(hourStart(2)), status: "failed", code: "plan-required" },
      ],
      pruned: { traffic_hourly: 1, error_daily: 1 },
    });
    expect(await count(`SELECT count(DISTINCT hour)::int AS n FROM traffic_hourly`)).toBe(3);
    expect(await count(`SELECT sum(count)::int AS n FROM error_daily`)).toBe(6);
    expect(await count(`SELECT count(*)::int AS n FROM traffic_hourly WHERE hour < now() - interval '35 days'`)).toBe(0);
    expect(await readTrafficCoverage(pgQuery, new Date())).toMatchObject({ state: "known", data: { ok: 3, failed: 1 } });
  });
});
