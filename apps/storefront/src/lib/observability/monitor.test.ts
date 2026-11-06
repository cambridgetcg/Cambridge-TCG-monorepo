import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  apiRouteView, coverage, loadMonitor, mcpView, readApiRouteHits, readDerivation, readJobOutcomes, readTraffic, utcDays,
  type AgentKeyUse, type McpCounts, type RunQuery,
} from "./monitor";

const NOW = new Date("2026-11-06T09:30:00.000Z");
const missing = (table: string) => Object.assign(new Error(`relation "${table}" does not exist`), { code: "42P01" });
/** A database that answers by the first table a statement names; tables listed in `absent` do not exist. */
function database(answers: Record<string, (sql: string, params?: unknown[]) => Record<string, unknown>[]>, absent: string[] = []) {
  const run = vi.fn<RunQuery>(async (sql, params) => {
    for (const table of absent) if (new RegExp(`\\b${table}\\b`).test(sql)) throw missing(table);
    for (const [needle, answer] of Object.entries(answers)) if (sql.includes(needle)) return { rows: answer(sql, params) };
    return { rows: [] };
  });
  return run;
}
afterEach(() => vi.unstubAllEnvs());

describe("monitor readers", () => {
  it("shows unknown with the migration a missing table needs, and a failed read as unknown, never as zero", async () => {
    const data = await loadMonitor(database({}, ["ops_job_outcomes", "mcp_daily", "traffic_hourly", "traffic_pulls", "error_daily", "market_derivation_runs"]), NOW);
    expect(data.collectors.jobs).toEqual({ state: "unknown", reason: "ops_job_outcomes is not provisioned here (migration 0148)" });
    expect(data.agents.mcp).toEqual({ state: "unknown", reason: "mcp_daily is not provisioned here (migration 0148)" });
    expect(data.traffic.coverage).toEqual({ state: "unknown", reason: "traffic_pulls is not provisioned here (migration 0148)" });
    expect(data.traffic.counts.state).toBe("unknown");
    expect(data.errors.state).toBe("unknown");
    expect(data.derivation).toEqual({ state: "unknown", reason: "market_derivation_runs is not provisioned here (migration 0141)" });
    expect(data.retention.state).toBe("unknown");
    // Tables that exist and hold nothing read as known and empty.
    expect(data.collectors.batches).toEqual({ state: "known", data: { window: [], latest: [] } });

    const failing = vi.fn<RunQuery>(async () => { throw new Error("connect ECONNREFUSED 10.0.0.1:5432"); });
    const failed = await loadMonitor(failing, NOW);
    expect(failed.collectors.batches).toEqual({ state: "unknown", reason: "member_price_batches could not be read" });
    expect(failed.collectors.sources.every((source) => source.hosts.hosts.every((host) => host.state === "unknown"))).toBe(true);
    expect(JSON.stringify(failed)).not.toContain("10.0.0.1");
  });

  it("reads counts only: no key, holder, price, level, ratio or FX rate is selected", async () => {
    const run = database({});
    await loadMonitor(run, NOW);
    const statements = run.mock.calls.map(([sql]) => sql).join("\n");
    for (const column of ["key_hash", "key_prefix", "SELECT holder", "amount", "level", "ratio_", "->>'rate'", "user_id", "operated_by", "public_handle", "quarantine FROM", "ingest_key FROM"]) {
      expect(statements).not.toContain(column);
    }
    // Quarantine entries hold source text: they are counted, never read out.
    expect(statements).toContain("jsonb_array_length(quarantine)");
  });

  it("gives each of the last 14 dates its run, its recorded refusal, or unknown", async () => {
    const run = database({
      "FROM ops_job_outcomes": () => [
        { job: "derive/market", started_at: "2026-11-05T07:00:01Z", finished_at: "2026-11-05T07:00:02Z", http_status: 503, outcome: "refused:no-inputs", counts: { asOf: "2026-11-05", excludedSources: { cardmarket: "derivation-off" } } },
        { job: "derive/market", started_at: "2026-11-03T07:00:01Z", finished_at: "2026-11-03T07:00:02Z", http_status: 503, outcome: "unavailable:error", counts: {} },
      ],
      "ORDER BY as_of DESC, id DESC LIMIT 1": () => [{ id: "12", as_of: "2026-11-06" }],
      "FROM market_derivation_runs r": () => [{ id: "12", as_of: "2026-11-06", created_at: "2026-11-06T07:00:40Z", sources: "cardrush,tcgplayer", fx_dates: '{"JPY":"2026-11-05","USD":"2026-11-05"}', references: 0, indices: 70, premiums: 35 }],
      "UNION ALL": () => [{ kind: "index", game: "one-piece", market: "tcgplayer", detail: "per set", n: 60 }, { kind: "premium", game: "one-piece", market: "tcgplayer / cardrush", detail: "per set", n: 35 }],
    });
    vi.stubEnv("DATA_DERIVE_MARKET", "on");
    const read = await readDerivation(run, NOW);
    expect(read.state).toBe("known");
    if (read.state !== "known") return;
    expect(read.data.on).toBe(true);
    expect(read.data.days).toHaveLength(14);
    expect(read.data.days.slice(0, 5).map((day) => [day.asOf, day.state])).toEqual([
      ["2026-11-06", "ran"], ["2026-11-05", "refused:no-inputs"], ["2026-11-04", "unknown"], ["2026-11-03", "unavailable:error"], ["2026-11-02", "unknown"],
    ]);
    expect(read.data.days[0]!.run).toMatchObject({ sources: ["cardrush", "tcgplayer"], fxDates: { JPY: "2026-11-05", USD: "2026-11-05" }, written: { references: 0, indices: 70, premiums: 35 } });
    expect(read.data.days[1]!.outcomes[0]!.counts.excludedSources).toEqual({ cardmarket: "derivation-off" });
    expect(read.data.counts).toHaveLength(2);
  });

  it("returns each job's latest outcome with its counts parsed, whichever driver read them", async () => {
    const run = database({
      "DISTINCT ON (job)": () => [{ job: "collect/tcgplayer", started_at: new Date("2026-11-06T08:45:00Z"), finished_at: new Date("2026-11-06T08:49:31Z"), http_status: 200, outcome: "ran", counts: '{"setsWritten":3}' }],
      "GROUP BY 1, 2": () => [{ job: "collect/tcgplayer", outcome: "ran", runs: 24, last_at: "2026-11-06T08:45:00Z" }],
    });
    expect(await readJobOutcomes(run)).toEqual({ state: "known", data: {
      latest: [{ job: "collect/tcgplayer", startedAt: "2026-11-06T08:45:00.000Z", finishedAt: "2026-11-06T08:49:31.000Z", httpStatus: 200, outcome: "ran", counts: { setsWritten: 3 } }],
      tally: [{ job: "collect/tcgplayer", outcome: "ran", runs: 24, lastAt: "2026-11-06T08:45:00.000Z" }],
    } });
  });

  it("folds traffic into days with RSC, direct-to-Vercel and status mix", async () => {
    const run = database({
      "AS direct": () => [{ day: "2026-11-06", requests: "1000", rsc: "450", direct: "60" }],
      "status_class, sum(count)": () => [{ day: "2026-11-06", status_class: "2xx", requests: "900" }, { day: "2026-11-06", status_class: "404", requests: "100" }],
    });
    const read = await readTraffic(run, NOW);
    expect(read).toMatchObject({ state: "known", data: { days: [{ day: "2026-11-06", requests: 1000, rsc: 450, direct: 60, statuses: { "2xx": 900, "404": 100 } }] } });
    expect(run.mock.calls[0]![1]).toEqual(["2026-10-31"]);
  });
});

describe("counts a few holders could be pinned on", () => {
  const hits = [
    { pathGroup: "/api/v1/market/*", statusClass: "2xx", requests: 840 },
    { pathGroup: "/api/v1/market/*", statusClass: "404", requests: 12 },
    { pathGroup: "/api/v1/member-prices", statusClass: "2xx", requests: 30 },
    { pathGroup: "/api/v1/member-prices", statusClass: "401", requests: 4 },
    { pathGroup: "/api/v1/plans", statusClass: "2xx", requests: 9 },
  ];
  const usage = (accounts: number) => ({ state: "known" as const, data: [{ month: "2026-11-01", requests: 900, accounts }, { month: "2026-10-01", requests: 400, accounts }] });

  it("totals the data-API routes over 35 days by route and status, with no day or hour", async () => {
    const run = vi.fn<RunQuery>(async () => ({ rows: [{ path_group: "/api/v1/market/*", status_class: "2xx", requests: "840" }] }));
    expect(await readApiRouteHits(run)).toEqual({ state: "known", data: [{ pathGroup: "/api/v1/market/*", statusClass: "2xx", requests: 840 }] });
    expect(run.mock.calls[0]![0]).not.toMatch(/AS day|hour AT TIME ZONE/);
  });

  it("shows a key-gated route's answers to holders only once five accounts used the data API in each month", () => {
    const few = apiRouteView(hits, usage(1), NOW);
    expect(few.rows.map((row) => `${row.pathGroup} ${row.statusClass}`)).toEqual(["/api/v1/market/* 404", "/api/v1/member-prices 401", "/api/v1/plans 2xx"]);
    expect(few.withheld).toContain("1 account used the data API");
    // 35 days back from 2 March reach into January: every month between counts.
    const march = new Date("2026-03-02T09:00:00Z");
    const quiet = { state: "known" as const, data: [{ month: "2026-03-01", requests: 9, accounts: 6 }, { month: "2026-01-01", requests: 9, accounts: 6 }, { month: "2026-02-01", requests: 9, accounts: 2 }] };
    expect(apiRouteView(hits, quiet, march).withheld).toContain("2 accounts used the data API");
    const many = apiRouteView(hits, usage(5), NOW);
    // Member-price keys are not counted past a day, so their served counts stay withheld.
    expect(many.rows.map((row) => `${row.pathGroup} ${row.statusClass}`)).toEqual(["/api/v1/market/* 2xx", "/api/v1/market/* 404", "/api/v1/member-prices 401", "/api/v1/plans 2xx"]);
    // A month with no row is a month with no account.
    expect(apiRouteView(hits, { state: "known", data: [{ month: "2026-11-01", requests: 900, accounts: 9 }] }, NOW).rows).not.toContainEqual(hits[0]);
    expect(apiRouteView(hits, { state: "unknown", reason: "x" }, NOW).withheld).toContain("an unknown number of accounts");
    expect(apiRouteView([hits[1]!, hits[4]!], usage(1), NOW)).toEqual({ rows: [hits[1], hits[4]], withheld: null });
  });

  it("shows authenticated MCP rows by tool only once five active keys were used in 30 days", () => {
    const mcp: McpCounts = { on: true, days: [], tally: [
      { method: "tools/call", tool: "agent.self", authenticated: true, outcome: "ok", requests: 31 },
      { method: "initialize", tool: "none", authenticated: false, outcome: "ok", requests: 9 },
    ] };
    const keys = (used: number): { state: "known"; data: AgentKeyUse } => ({ state: "known", data: { keys: 9, active: 9, never: 0, lastHour: used, lastDay: 0, lastWeek: 0, lastMonth: 0, older: 9 - used } });
    expect(mcpView(mcp, keys(1))).toEqual({ tally: [mcp.tally[1]], withheld: expect.stringContaining("1 active key was used in 30 days") });
    expect(mcpView(mcp, { state: "unknown", reason: "x" }).tally).toEqual([mcp.tally[1]]);
    expect(mcpView(mcp, keys(5))).toEqual({ tally: mcp.tally, withheld: null });
  });
});

describe("traffic coverage", () => {
  it("counts every whole hour of 35 days, unknown unless a pull covered it, the best pull winning", () => {
    const at = (iso: string) => new Date(iso).toISOString();
    const read = coverage([
      { start: at("2026-11-06T06:00Z"), end: at("2026-11-06T07:00Z"), status: "failed" },
      { start: at("2026-11-06T06:00Z"), end: at("2026-11-06T07:00Z"), status: "ok", pulledAt: at("2026-11-06T07:05Z") },
      { start: at("2026-11-06T07:00Z"), end: at("2026-11-06T08:00Z"), status: "partial" },
      { start: at("2026-11-06T08:00Z"), end: at("2026-11-06T09:00Z"), status: "failed", pulledAt: at("2026-11-06T09:05Z") },
      // A start's marker: the hour began before counting started.
      { start: at("2026-11-06T02:00Z"), end: at("2026-11-06T03:00Z"), status: "skipped" },
      // The current hour (09:00 to 10:00) is not pullable yet, and a window outside 35 days is ignored.
      { start: at("2026-11-06T09:00Z"), end: at("2026-11-06T10:00Z"), status: "ok" },
      { start: at("2026-09-01T00:00Z"), end: at("2026-09-01T01:00Z"), status: "ok" },
    ], NOW);
    expect(read).toMatchObject({ hours: 35 * 24, ok: 1, partial: 1, failed: 1, skipped: 1, unknown: 35 * 24 - 4, lastPullAt: "2026-11-06T09:05:00.000Z" });
    // Each day says how many of its hours exist yet and what became of them.
    expect(read.days[0]).toEqual({ day: "2026-11-06", hours: 9, ok: 1, partial: 1, failed: 1, skipped: 1, unknown: 5 });
    expect(read.days[1]).toEqual({ day: "2026-11-05", hours: 24, ok: 0, partial: 0, failed: 0, skipped: 0, unknown: 24 });
    expect(coverage([], NOW)).toMatchObject({ ok: 0, unknown: 840, lastPullAt: null });
  });

  it("names UTC days newest first", () => {
    expect(utcDays(new Date("2026-11-06T23:59:59-05:00"), 3)).toEqual(["2026-11-07", "2026-11-06", "2026-11-05"]);
  });
});
