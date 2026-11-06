import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLEAR_HOUR_SQL, COUNTED_PULLS_SQL, ERRORS_SQL, HOURLY_SQL, PULL_ROW_SQL, lastChance, pullableHours, runTrafficPull, trafficPullOn,
} from "./pull";

const HOUR = 3_600_000;
const NOW = Date.parse("2026-11-06T12:07:00.000Z");
const at = (iso: string) => Date.parse(iso);
const TOKEN = "test-token-not-real";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

type Page = Record<string, unknown>[] | Response;
type Script = Record<string, { requests?: Page[]; runtime?: Page[] }>;

/** Vercel, answering by window start, source and cursor ("p<n>"). A
 * Response in the script is answered as it is, and used once. */
function fakeVercel(script: Script, clock: { at: number }, stepMs = 0) {
  return vi.fn<typeof fetch>(async (_url, init) => {
    clock.at += stepMs;
    const body = JSON.parse(String(init!.body)) as { event: string; timeRange: { start: string }; cursor?: string };
    const source = body.event === "vercel.log" ? "runtime" : "requests";
    const pages = script[body.timeRange.start]?.[source] ?? [[]];
    const index = body.cursor ? Number(body.cursor.slice(1)) : 0;
    const entry = pages[index];
    if (entry instanceof Response) { pages.splice(index, 1); return entry; }
    const more = index + 1 < pages.length;
    return new Response(JSON.stringify({ events: entry ?? [], pagination: { hasMore: more, nextCursor: more ? `p${index + 1}` : null } }), { status: 200 });
  });
}

/** traffic_pulls and the hour's writes, kept in memory; a counted pull that
 * overlaps another is refused as 0148's exclusion constraint refuses it. */
function fakeStore(seed: { start: string; end: string; status: string }[] = []) {
  const pulls = [...seed];
  const committed: { sql: string; params: unknown[] }[] = [];
  const statements: string[] = [];
  const overlaps = (start: string, end: string) => pulls.some(pull => pull.status !== "failed" && at(pull.start) < at(end) && at(pull.end) > at(start));
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    statements.push(sql);
    if (sql === COUNTED_PULLS_SQL) {
      const first = pulls.length ? new Date(Math.min(...pulls.map(pull => at(pull.start)))) : null;
      const counted = pulls.filter(pull => pull.status !== "failed" && at(pull.end) > at(params[0] as string) && at(pull.start) < at(params[1] as string));
      return { rows: counted.length ? counted.map(pull => ({ first_start: first, window_start: new Date(pull.start), window_end: new Date(pull.end) })) : [{ first_start: first, window_start: null, window_end: null }] };
    }
    if (sql === PULL_ROW_SQL) { pulls.push({ start: params[0] as string, end: params[1] as string, status: params[2] as string }); committed.push({ sql, params }); }
    if (sql.startsWith("WITH d0 AS (DELETE FROM")) return { rows: [{ ops_job_outcomes: 0, mcp_daily: 0, traffic_hourly: 2, traffic_pulls: 1, error_daily: 0 }] };
    return { rows: [] };
  });
  const transaction = vi.fn(async <T>(work: (tx: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>) => Promise<T>) => {
    const pending: { sql: string; params: unknown[] }[] = [];
    const result = await work(async (sql, params = []) => {
      if (sql === PULL_ROW_SQL && overlaps(params[0] as string, params[1] as string)) throw Object.assign(new Error("conflicting key value violates exclusion constraint"), { code: "23P01" });
      pending.push({ sql, params });
      return { rows: [] };
    });
    for (const write of pending) {
      if (write.sql === PULL_ROW_SQL) pulls.push({ start: write.params[0] as string, end: write.params[1] as string, status: write.params[2] as string });
      committed.push(write);
    }
    return result;
  });
  return { pulls, committed, statements, query, transaction };
}

/** A pull that ran before the window, so the pull has a history, and
 * every pullable hour at NOW counted already, except these. */
const coveredExcept = (...open: string[]) => [
  { start: "2026-11-04T09:00:00.000Z", end: "2026-11-04T10:00:00.000Z", status: "ok" },
  ...pullableHours(NOW).filter(hour => !open.includes(new Date(hour).toISOString()))
    .map(hour => ({ start: new Date(hour).toISOString(), end: new Date(hour + HOUR).toISOString(), status: "ok" })),
];

function run(script: Script, store: ReturnType<typeof fakeStore>, options: { stepMs?: number; budgetMs?: number; token?: string } = {}) {
  const clock = { at: NOW };
  const fetch = fakeVercel(script, clock, options.stepMs);
  const sleep = vi.fn(async (ms: number) => { clock.at += ms; });
  const promise = runTrafficPull({ query: store.query, transaction: store.transaction as never, fetch, now: () => clock.at, sleep, token: options.token ?? TOKEN, budgetMs: options.budgetMs });
  return { promise, fetch, sleep };
}

const request = (id: string, overrides: Record<string, unknown> = {}) => ({
  timestamp: "2026-11-06T11:20:00.000Z", requestId: id, requestHostname: "cambridgetcg.com", requestPath: `/product/sku-${id}`, route: "/product/[sku]",
  httpStatus: 200, cacheResult: "MISS", wafAction: "allow", clientUserAgent: CHROME, clientIpCountry: "GB", ...overrides,
});
const line = (requestId: string, message: string, level = "error") => ({ timestamp: "2026-11-06T11:21:00.000Z", requestId, level, message });
const writes = (store: ReturnType<typeof fakeStore>, sql: string) => store.committed.filter(write => write.sql === sql);
const H11 = "2026-11-06T11:00:00.000Z";

afterEach(() => { vi.unstubAllEnvs(); });

describe("which hours", () => {
  it("at :07 offers the previous hour and the 22 before it, oldest first, all inside Vercel's day", () => {
    const hours = pullableHours(NOW);
    expect(hours).toHaveLength(23);
    expect(new Date(hours.at(-1)!).toISOString()).toBe(H11);
    expect(new Date(hours[0]!).toISOString()).toBe("2026-11-05T13:00:00.000Z");
    expect(NOW - hours[0]!).toBeLessThan(24 * HOUR);
    expect([...hours].sort((a, b) => a - b)).toEqual(hours);
  });

  it("calls an hour's last chance the run before it falls out of the window", () => {
    expect(lastChance(at("2026-11-05T13:00:00.000Z"), NOW)).toBe(true);
    expect(lastChance(at("2026-11-05T14:00:00.000Z"), NOW)).toBe(false);
    expect(lastChance(at(H11), NOW)).toBe(false);
  });

  it("is on only for exactly on", () => {
    expect([undefined, "", "on", "ON", " on", "true", "1"].map(value => trafficPullOn({ TRAFFIC_PULL: value }))).toEqual([false, false, true, false, false, false, false]);
  });
});

describe("runTrafficPull", () => {
  it("reads nothing without a token, and nothing before 0148", async () => {
    vi.stubEnv("VERCEL_TOKEN", "  ");
    const store = fakeStore();
    const fetch = vi.fn<typeof globalThis.fetch>();
    expect(await runTrafficPull({ query: store.query, transaction: store.transaction as never, fetch })).toEqual({ ran: false, reason: "token-missing" });
    expect(store.query).not.toHaveBeenCalled();
    store.query.mockRejectedValueOnce(Object.assign(new Error("relation \"traffic_pulls\" does not exist"), { code: "42P01" }));
    expect(await runTrafficPull({ query: store.query, transaction: store.transaction as never, fetch, token: TOKEN })).toEqual({ ran: false, reason: "not-provisioned" });
    store.query.mockRejectedValueOnce(new Error("connection refused"));
    expect(await runTrafficPull({ query: store.query, transaction: store.transaction as never, fetch, token: TOKEN })).toEqual({ ran: false, reason: "store-unavailable" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("counts the previous hour once: words and counts in one transaction, its pull row first, then the sweep", async () => {
    const store = fakeStore(coveredExcept(H11));
    const countries = ["US", "SG", "JP", "DE", "BR"];
    const script: Script = {
      [H11]: {
        requests: [
          [...countries.map((country, i) => request(`f${i}`, { clientIpCountry: country })), request("g1", { clientUserAgent: GOOGLEBOT, httpStatus: 404, requestPath: "/market/x" })],
          // A repeat at the page boundary, a record outside the hour, and Vercel's cron.
          [request("g1", { clientUserAgent: GOOGLEBOT, httpStatus: 404 }), request("late", { timestamp: "2026-11-06T12:00:00.000Z" }),
            request("c1", { clientUserAgent: "vercel-cron/1.0", requestPath: "/api/cron/maintenance", cacheResult: "BYPASS", httpStatus: 500 })],
        ],
        runtime: [[
          line("f0", "[wholesale] price-sources error 503"), line("c1", "[cron] trade completion sweep failed: COALESCE types integer and text cannot be matched"),
          line("gone", "[fairness-audit] CRITICAL FAILURE source=bounty_pull"), line("f1", "[cron/collect/tcgplayer] {\"ran\":true}", "info"),
        ]],
      },
    };
    const { promise, fetch } = run(script, store);
    const report = await promise;
    expect(report).toMatchObject({ ran: true, pending: 0, stoppedBy: null, pruned: { traffic_hourly: 2 } });
    if (!report.ran) throw new Error("did not run");
    expect(report.hours).toEqual([{ hour: H11, status: "ok", records: 7, pages: 3, code: null, rows: 3, errors: 3 }]);
    expect(fetch).toHaveBeenCalledTimes(3);

    expect(store.transaction).toHaveBeenCalledOnce();
    expect(store.committed.map(write => write.sql)).toEqual([PULL_ROW_SQL, CLEAR_HOUR_SQL, HOURLY_SQL, ERRORS_SQL]);
    expect(writes(store, PULL_ROW_SQL)[0]!.params).toEqual([H11, "2026-11-06T12:00:00.000Z", "ok", 7, 3, null]);
    const rows = JSON.parse(writes(store, HOURLY_SQL)[0]!.params[1] as string) as Record<string, unknown>[];
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ actor_class: "browser-like-fleet", path_group: "/product/[sku]", status_class: "2xx", count: 5 }),
      expect.objectContaining({ actor_class: "search-crawler", path_group: "/market/[sku]", status_class: "404", count: 1 }),
      expect.objectContaining({ actor_class: "cron-self", path_group: "/api/cron/*", status_class: "500", cache_result: "bypass", count: 1 }),
    ]));
    const errors = writes(store, ERRORS_SQL)[0]!.params;
    expect(errors[0]).toBe("2026-11-06");
    expect(JSON.parse(errors[1] as string)).toEqual(expect.arrayContaining([
      { tag: "wholesale", status: 200, count: 1 }, { tag: "cron", status: 500, count: 1 }, { tag: "fairness-audit", status: 0, count: 1 },
    ]));
    // Nothing a record carried is written: no user agent, path, request id, country or log text.
    const written = JSON.stringify(store.committed);
    for (const fragment of ["Mozilla", "Googlebot", "vercel-cron", "sku-", "/market/x", "\"f0\"", "\"g1\"", "\"US\"", "price-sources", "COALESCE", "bounty_pull"]) {
      expect(written).not.toContain(fragment);
    }
    expect(store.statements.at(-1)).toMatch(/^WITH d0 AS \(DELETE FROM/);

    // The next run finds the hour counted and asks Vercel nothing.
    const again = run(script, store);
    expect(await again.promise).toMatchObject({ ran: true, hours: [], pending: 0 });
    expect(again.fetch).not.toHaveBeenCalled();
  });

  it("on its first run counts only the previous hour, never the hours before the flag was on", async () => {
    const store = fakeStore();
    const H10 = "2026-11-06T10:00:00.000Z";
    const first = run({ [H11]: { requests: [[request("a")]] } }, store);
    expect(await first.promise).toMatchObject({ ran: true, pending: 0, hours: [{ hour: H11, status: "ok", records: 1 }] });
    expect(first.fetch.mock.calls.map(([, init]) => JSON.parse(String(init!.body)).timeRange.start)).toEqual([H11, H11]);
    // Once it has run, a missed hour after its first is back-filled; one before it never is.
    store.pulls.push({ start: "2026-11-06T09:00:00.000Z", end: H10, status: "failed" });
    const later = run({ [H10]: { requests: [[request("b", { timestamp: "2026-11-06T10:30:00.000Z" })]] } }, store);
    expect(await later.promise).toMatchObject({ hours: [{ hour: "2026-11-06T09:00:00.000Z", status: "failed", code: "no-records", records: 0 }, { hour: H10, status: "ok", records: 1 }] });
  });

  it("never records an hour with no request at all as a counted zero", async () => {
    const H13 = "2026-11-05T13:00:00.000Z";
    const store = fakeStore(coveredExcept(H11, H13));
    const { promise } = run({}, store);
    // Vercel's cron alone makes 60 requests an hour; none means the read went wrong.
    expect(await promise).toMatchObject({ stoppedBy: null, hours: [{ hour: H13, status: "partial", code: "no-records" }, { hour: H11, status: "failed", code: "no-records" }] });
    expect(writes(store, HOURLY_SQL)).toHaveLength(0);
  });

  it("leaves an hour another run counted first as it is", async () => {
    const store = fakeStore(coveredExcept(H11));
    const clock = { at: NOW };
    const vercel = fakeVercel({ [H11]: { requests: [[request("a")]] } }, clock);
    // The other run's row lands after this run read the coverage, while it reads Vercel.
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      if (!store.pulls.some(pull => pull.start === H11)) store.pulls.push({ start: H11, end: "2026-11-06T12:00:00.000Z", status: "ok" });
      return vercel(url, init);
    });
    const report = await runTrafficPull({ query: store.query, transaction: store.transaction as never, fetch, now: () => clock.at, token: TOKEN });
    expect(report).toMatchObject({ ran: true, hours: [{ hour: H11, status: "already-counted", rows: 0 }] });
    expect(writes(store, HOURLY_SQL)).toHaveLength(0);
  });

  it("back-fills missed hours oldest first", async () => {
    const H09 = "2026-11-06T09:00:00.000Z";
    const store = fakeStore(coveredExcept(H09, H11));
    const { promise, fetch } = run({ [H09]: { requests: [[request("a", { timestamp: "2026-11-06T09:30:00.000Z" })]] }, [H11]: { requests: [[request("b")]] } }, store);
    const report = await promise;
    expect(report).toMatchObject({ ran: true, hours: [{ hour: H09, status: "ok", records: 1 }, { hour: H11, status: "ok", records: 1 }] });
    expect(fetch.mock.calls.map(([, init]) => JSON.parse(String(init!.body)).timeRange.start)).toEqual([H09, H09, H11, H11]);
  });

  it("records a rate-limited hour as failed, counts nothing for it, and leaves the rest for the next run", async () => {
    const H10 = "2026-11-06T10:00:00.000Z";
    const store = fakeStore(coveredExcept(H10, H11));
    const { promise } = run({ [H10]: { requests: [[request("a", { timestamp: "2026-11-06T10:20:00.000Z" })], new Response("", { status: 429, headers: { "retry-after": "600" } })] } }, store);
    const report = await promise;
    expect(report).toMatchObject({ ran: true, stoppedBy: "rate-limited", pending: 1, hours: [{ hour: H10, status: "failed", code: "rate-limited", records: 1 }] });
    expect(store.transaction).not.toHaveBeenCalled();
    expect(writes(store, PULL_ROW_SQL).map(write => write.params)).toEqual([[H10, "2026-11-06T11:00:00.000Z", "failed", 1, 1, "rate-limited"]]);
    // A failed hour counted nothing, so the next run asks for it again.
    const retry = run({ [H10]: { requests: [[request("a", { timestamp: "2026-11-06T10:20:00.000Z" })]] }, [H11]: { requests: [[request("b")]] } }, store);
    expect(await retry.promise).toMatchObject({ hours: [{ hour: H10, status: "ok" }, { hour: H11, status: "ok" }] });
  });

  it("keeps what it read of an hour on its last chance, as partial", async () => {
    const H13 = "2026-11-05T13:00:00.000Z";
    const store = fakeStore(coveredExcept(H13));
    const failing = () => new Response("", { status: 500 });
    const { promise } = run({ [H13]: { requests: [[request("a", { timestamp: "2026-11-05T13:10:00.000Z" })], failing(), failing(), failing()] } }, store);
    const report = await promise;
    expect(report).toMatchObject({ ran: true, stoppedBy: "http-500", hours: [{ hour: H13, status: "partial", code: "http-500", records: 1, rows: 1, errors: 0 }] });
    expect(writes(store, PULL_ROW_SQL)[0]!.params).toEqual([H13, "2026-11-05T14:00:00.000Z", "partial", 1, 1, "http-500"]);
    expect(writes(store, ERRORS_SQL)).toHaveLength(0);
  });

  it("keeps an hour's whole traffic when its error lines cannot be read for good, and tries again when it may pass", async () => {
    const H10 = "2026-11-06T10:00:00.000Z";
    const lasting = fakeStore(coveredExcept(H10, H11));
    const first = run({
      [H10]: { requests: [[request("a", { timestamp: "2026-11-06T10:05:00.000Z" })]], runtime: [new Response("Observability Plus is required", { status: 402 })] },
      [H11]: { requests: [[request("b")]] },
    }, lasting);
    expect(await first.promise).toMatchObject({ stoppedBy: null, hours: [{ hour: H10, status: "partial", code: "errors-plan-required", rows: 1 }, { hour: H11, status: "ok" }] });

    const passing = fakeStore(coveredExcept(H11));
    const down = () => new Response("", { status: 503 });
    const second = run({ [H11]: { requests: [[request("b")]], runtime: [down(), down(), down()] } }, passing);
    expect(await second.promise).toMatchObject({ stoppedBy: "http-503", hours: [{ hour: H11, status: "failed", code: "errors-http-503" }] });
    expect(passing.transaction).not.toHaveBeenCalled();
  });

  it("marks an hour with a gap Vercel reported as partial", async () => {
    const store = fakeStore(coveredExcept(H11));
    const gap = new Response(JSON.stringify({ events: [request("a")], pagination: { hasMore: false, nextCursor: null }, meta: { excludedIntervals: [{ start: "2026-11-06T11:40:00Z", end: "2026-11-06T11:45:00Z" }] } }), { status: 200 });
    const { promise } = run({ [H11]: { requests: [gap] } }, store);
    expect(await promise).toMatchObject({ hours: [{ hour: H11, status: "partial", code: "stream-gap", records: 1 }] });
  });

  it("starts no hour once the budget runs low, leaving it unknown for the next run", async () => {
    const H10 = "2026-11-06T10:00:00.000Z";
    const store = fakeStore(coveredExcept(H10, H11));
    // Each request to Vercel takes 10 s; the budget is 45 s, and an hour needs 30 s left to start.
    const { promise } = run({ [H10]: { requests: [[request("a", { timestamp: "2026-11-06T10:05:00.000Z" })]] }, [H11]: { requests: [[request("b")]] } }, store, { stepMs: 10_000, budgetMs: 45_000 });
    expect(await promise).toMatchObject({ ran: true, stoppedBy: "budget-exhausted", pending: 1, hours: [{ hour: H10, status: "ok" }] });
    expect(store.pulls.filter(pull => pull.start === H11)).toEqual([]);
  });
});
