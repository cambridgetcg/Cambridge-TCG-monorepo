import { describe, expect, it, vi } from "vitest";
import { PROJECTS, TEAM_ID } from "@/lib/admin/vercel";
import { LOG_SOURCES, MAX_PAGE_SIZE, VERCEL_EVENTS_URL, readLogWindow, retryAfterMs, type LogSource } from "./vercel-logs";

const TOKEN = "test-token-not-real";
const start = new Date("2026-11-06T10:00:00.000Z"), end = new Date("2026-11-06T11:00:00.000Z");
const page = (events: Record<string, unknown>[], nextCursor: string | null, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ events, pagination: { hasMore: nextCursor !== null, nextCursor }, ...extra }), { status: 200, headers: { "content-type": "application/json" } });
const status = (code: number, body = "", headers: Record<string, string> = {}) => new Response(body, { status: code, headers });

function reader(responses: (Response | Error)[], options: { source?: LogSource; deadline?: number; clock?: { at: number } } = {}) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  });
  const clock = options.clock ?? { at: Date.parse("2026-11-06T12:07:00.000Z") };
  const sleep = vi.fn(async (ms: number) => { clock.at += ms; });
  const seen: Record<string, unknown>[] = [];
  const run = () => readLogWindow({
    source: options.source ?? "requests", start, end, token: TOKEN, deadline: options.deadline ?? clock.at + 240_000,
    fetch, now: () => clock.at, sleep, onEvents: events => { seen.push(...events); },
  });
  const bodies = () => fetch.mock.calls.map(([, init]) => JSON.parse(String(init!.body)) as Record<string, unknown>);
  return { fetch, sleep, seen, run, bodies };
}

describe("readLogWindow", () => {
  it("asks Vercel's events endpoint for the storefront's production records, as the CLI does, with no IP field", async () => {
    const { fetch, run, bodies } = reader([page([{ requestId: "a" }], null)]);
    expect(await run()).toEqual({ complete: true, pages: 1, excluded: [], failure: null });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(`${VERCEL_EVENTS_URL}?teamId=${TEAM_ID}`);
    expect(init).toMatchObject({ method: "POST", cache: "no-store" });
    const headers = new Headers(init!.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headers.get("x-vercel-observability-query-reason")).toBe("cambridgetcg-storefront/traffic-pull/requests");
    expect(bodies()[0]).toEqual({
      event: "vercel.proxy_response",
      scope: { ownerId: TEAM_ID, projectIds: [PROJECTS.find(project => project.key === "storefront")!.projectId] },
      timeRange: { start: start.toISOString(), end: end.toISOString() },
      select: [...LOG_SOURCES.requests.select], order: "desc", limit: MAX_PAGE_SIZE,
      filter: `(environment:"production") AND (NOT pathType:"background_func")`,
    });
    for (const source of Object.values(LOG_SOURCES)) {
      expect(source.select.join(" ")).not.toMatch(/clientIp\b|clientIp"|ja4|asn|referer|query/i);
    }
  });

  it("asks for error lines only from the runtime logs", async () => {
    const { run, bodies } = reader([page([], null)], { source: "runtime" });
    await run();
    expect(bodies()[0]).toMatchObject({ event: "vercel.log", select: ["requestId", "level", "message"], filter: `(environment:"production") AND (level:(error OR fatal))` });
  });

  it("follows cursors to the last page and stops if a cursor repeats", async () => {
    const { run, seen, bodies } = reader([page([{ n: 1 }], "c1"), page([{ n: 2 }], "c2"), page([{ n: 3 }], null)]);
    expect(await run()).toMatchObject({ complete: true, pages: 3 });
    expect(seen).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
    expect(bodies().map(body => body.cursor)).toEqual([undefined, "c1", "c2"]);
    const again = reader([page([{ n: 1 }], "c1"), page([{ n: 2 }], "c1")]);
    expect(await again.run()).toMatchObject({ complete: true, pages: 2 });
  });

  it("halves the page size when a page is too large, as the CLI does", async () => {
    const { run, bodies } = reader([status(413, JSON.stringify({ error: { code: "result_too_large" } })), page([{ n: 1 }], null)]);
    expect(await run()).toMatchObject({ complete: true, pages: 1 });
    expect(bodies().map(body => body.limit)).toEqual([1000, 500]);
  });

  it("waits out a short Retry-After, and stops the run for a long one", async () => {
    const short = reader([status(429, "", { "retry-after": "3" }), page([], null)]);
    expect(await short.run()).toMatchObject({ complete: true });
    expect(short.sleep).toHaveBeenCalledWith(3000);
    const long = reader([status(429, "", { "retry-after": "120" })]);
    expect(await long.run()).toMatchObject({ complete: false, failure: { code: "rate-limited", stopsRun: true } });
    expect(long.fetch).toHaveBeenCalledTimes(1);
  });

  it("tries a 5xx or a dropped connection twice more, then stops the run", async () => {
    const recovers = reader([status(502), new TypeError("fetch failed"), page([{ n: 1 }], null)]);
    expect(await recovers.run()).toMatchObject({ complete: true, pages: 1 });
    expect(recovers.sleep.mock.calls.map(([ms]) => ms)).toEqual([2000, 5000]);
    const down = reader([status(503), status(503), status(503)]);
    expect(await down.run()).toMatchObject({ complete: false, failure: { code: "http-503", stopsRun: true } });
    expect(down.fetch).toHaveBeenCalledTimes(3);
  });

  it.each([
    [status(401), { code: "token-refused", stopsRun: true }],
    [status(403, JSON.stringify({ error: { invalidToken: true } })), { code: "token-refused", stopsRun: true }],
    [status(402, "Observability Plus is required for CDN requests older than 1 day."), { code: "plan-required", stopsRun: false }],
    [status(400, "The pro plan does not retain runtime logs for the requested time range."), { code: "outside-retention", stopsRun: false }],
    [status(400, JSON.stringify({ error: { message: "Invalid filter" } })), { code: "query-rejected", stopsRun: true }],
    [status(404), { code: "http-404", stopsRun: true }],
    [new Response("not json", { status: 200 }), { code: "invalid-response", stopsRun: true }],
    [new Response(JSON.stringify({ events: "nope" }), { status: 200 }), { code: "invalid-response", stopsRun: true }],
  ] as const)("names a refusal in its own words (%#)", async (response, failure) => {
    const { run } = reader([response]);
    const result = await run();
    expect(result).toMatchObject({ complete: false, failure });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it("starts no request after the deadline", async () => {
    const clock = { at: 1_000 };
    const { run, fetch } = reader([page([], null)], { clock, deadline: 1_000 });
    expect(await run()).toMatchObject({ complete: false, pages: 0, failure: { code: "budget-exhausted", stopsRun: true } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not retry past the deadline", async () => {
    const clock = { at: 0 };
    const { run, fetch } = reader([status(500), page([], null)], { clock, deadline: 1_000 });
    expect(await run()).toMatchObject({ complete: false, failure: { code: "http-500" } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("passes on the intervals Vercel left out", async () => {
    const { run } = reader([page([], null, { meta: { excludedIntervals: [{ start: "2026-11-06T10:10:00Z", end: "2026-11-06T10:12:00Z" }, { start: 1 }] } })]);
    expect(await run()).toMatchObject({ complete: true, excluded: [{ start: "2026-11-06T10:10:00Z", end: "2026-11-06T10:12:00Z" }] });
  });

  it("reads Retry-After as seconds or a date", () => {
    expect(retryAfterMs("5")).toBe(5000);
    expect(retryAfterMs(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
    expect(retryAfterMs("soon")).toBeNull();
    expect(retryAfterMs(null)).toBeNull();
  });
});
