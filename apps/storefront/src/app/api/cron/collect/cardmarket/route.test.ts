import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CARDMARKET_EVIDENCE_VERSION } from "@cambridge-tcg/data-ingest/member-prices";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), collect: vi.fn(), query: vi.fn(), transaction: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/cron-auth", () => ({ requireCronAuth: mocks.auth }));
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: mocks.transaction }));
vi.mock("@/lib/datafeed/cardmarket-collector", () => ({ collectCardmarketMemberPrices: mocks.collect, CARDMARKET_COLLECT_BUDGET_MS: 270_000 }));
const ops = vi.hoisted(() => ({ record: vi.fn() }));
// The outcome row (lib/observability/job-outcomes.ts) goes to its own port, so
// the statements this file counts on the database stay exactly the job's own.
vi.mock("@/lib/observability/job-outcomes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/observability/job-outcomes")>();
  return { ...actual, recordedRun: ((job, work, outcomeOf) => actual.recordedRun(job, work, outcomeOf, ops.record)) as typeof actual.recordedRun };
});
/** Each ops_job_outcomes row the route wrote: job, HTTP status, outcome, counts. */
const outcomes = () => ops.record.mock.calls.filter(([sql]) => String(sql).startsWith("INSERT INTO ops_job_outcomes"))
  .map(([, params]) => ({ job: params[0], status: params[3], outcome: params[4], counts: JSON.parse(params[5]) }));
import { GET, maxDuration } from "./route";
import { CARDMARKET_COLLECT_BUDGET_MS } from "@/lib/datafeed/cardmarket-collector";

const request = () => new Request("https://cambridgetcg.com/api/cron/collect/cardmarket");
const fetchSpy = vi.fn();
const summary = (ok: boolean) => ({ ran: true, ok, source: "cardmarket", evidenceVersion: CARDMARKET_EVIDENCE_VERSION, budgetMs: 270_000, elapsedMs: 12, games: [{ gameId: 18, game: "one-piece", status: ok ? "completed" : "source-unavailable" }], setCrosswalks: { status: "completed", rows: 55, written: 0, superseded: 0, unchanged: 55 } });

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  ops.record.mockReset().mockResolvedValue({ rows: [], rowCount: 1 });
  mocks.auth.mockReturnValue(null);
  vi.stubGlobal("fetch", fetchSpy.mockReset());
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Cardmarket collection cron", () => {
  it("answers a denied request with the auth response and does nothing else", async () => {
    const denied = new Response("denied", { status: 401 });
    mocks.auth.mockReturnValue(denied);
    vi.stubEnv("DATA_COLLECT_CARDMARKET", "on");
    expect(await GET(request())).toBe(denied);
    expect(mocks.collect).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "off", "ON", "true", "1", " on"])("stays inert unless the flag is exactly on (%j): no network, no database", async (flag) => {
    vi.stubEnv("DATA_COLLECT_CARDMARKET", flag);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ ok: true, ran: false, reason: "disabled" });
    expect(mocks.auth).toHaveBeenCalledOnce();
    for (const port of [mocks.collect, mocks.query, mocks.transaction, fetchSpy]) expect(port).not.toHaveBeenCalled();
  });

  it("runs the collector with the Cardmarket policy's evidence version and returns its summary", async () => {
    vi.stubEnv("DATA_COLLECT_CARDMARKET", "on");
    mocks.collect.mockResolvedValue(summary(true));
    const response = await GET(request());
    expect(mocks.collect).toHaveBeenCalledWith(CARDMARKET_EVIDENCE_VERSION);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(summary(true));
  });

  it("reports an incomplete run as 503 with its summary, not as success", async () => {
    vi.stubEnv("DATA_COLLECT_CARDMARKET", "on");
    mocks.collect.mockResolvedValue(summary(false));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ran: true, ok: false, games: [{ status: "source-unavailable" }] });
  });

  it("answers a run while another holds the lease as ran:false, and a store without the lease table as 503", async () => {
    vi.stubEnv("DATA_COLLECT_CARDMARKET", "on");
    mocks.collect.mockResolvedValueOnce({ ran: false, reason: "run-in-progress" });
    const held = await GET(request());
    expect(held.status).toBe(200);
    expect(await held.json()).toEqual({ ok: true, ran: false, reason: "run-in-progress" });
    mocks.collect.mockResolvedValueOnce({ ran: false, reason: "request-spacing" });
    const spaced = await GET(request());
    expect(spaced.status).toBe(200);
    expect(await spaced.json()).toEqual({ ok: true, ran: false, reason: "request-spacing" });
    mocks.collect.mockResolvedValueOnce({ ran: false, reason: "lease-not-provisioned" });
    const missing = await GET(request());
    expect(missing.status).toBe(503);
    expect(await missing.json()).toMatchObject({ ok: false, ran: false, reason: "lease-not-provisioned" });
  });

  it("answers a file host backing off as ran:false, and a suspended one as 503 until a person clears it", async () => {
    vi.stubEnv("DATA_COLLECT_CARDMARKET", "on");
    const host = { host: "downloads.s3.cardmarket.com", notBefore: "2026-10-29T12:00:00.000Z", suspendedAt: null, suspendedReason: null };
    mocks.collect.mockResolvedValueOnce({ ran: false, reason: "host-backing-off", ...host });
    const waiting = await GET(request());
    expect(waiting.status).toBe(200);
    expect(await waiting.json()).toEqual({ ok: true, ran: false, reason: "host-backing-off", host: host.host, notBefore: host.notBefore });
    mocks.collect.mockResolvedValueOnce({ ran: false, reason: "host-suspended", ...host, suspendedAt: "2026-10-29T06:00:00.000Z", suspendedReason: "http-429" });
    const suspended = await GET(request());
    expect(suspended.status).toBe(503);
    expect(await suspended.json()).toMatchObject({ ok: false, ran: false, reason: "host-suspended", host: host.host, suspendedAt: "2026-10-29T06:00:00.000Z", suspendedReason: "http-429" });
  });

  it("keeps an unexpected failure's text out of the response", async () => {
    vi.stubEnv("DATA_COLLECT_CARDMARKET", "on");
    mocks.collect.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.1:5432 password=..."));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("ECONNREFUSED");
  });

  it("records each enabled run's outcome and counts, never a disabled one", async () => {
    await GET(request());
    expect(ops.record).not.toHaveBeenCalled();
    vi.stubEnv("DATA_COLLECT_CARDMARKET", "on");
    mocks.collect.mockResolvedValueOnce({ ...summary(true), games: [{ gameId: 18, game: "one-piece", status: "completed", sourceRows: 74_600, observations: 74_000, mappedObservations: 0, missingPriceFields: 12, quarantined: 3 }], hostState: { recorded: 1 } });
    mocks.collect.mockResolvedValueOnce(summary(false));
    mocks.collect.mockResolvedValueOnce({ ran: false, reason: "host-suspended", host: "downloads.s3.cardmarket.com", notBefore: null, suspendedAt: "2026-10-29T06:00:00.000Z", suspendedReason: "http-429" });
    mocks.collect.mockRejectedValueOnce(new Error("connect ECONNREFUSED 10.0.0.1:5432"));
    for (const status of [200, 503, 503, 500]) expect((await GET(request())).status).toBe(status);
    expect(outcomes()).toEqual([
      { job: "collect/cardmarket", status: 200, outcome: "ran", counts: {
        elapsedMs: 12, games: { 18: "completed" }, sourceRows: 74_600, observations: 74_000, missingPriceFields: 12, quarantined: 3,
        setCrosswalks: { status: "completed", written: 0, superseded: 0, unchanged: 55 }, hostStateRecorded: 1,
      } },
      { job: "collect/cardmarket", status: 503, outcome: "unavailable:source-unavailable", counts: expect.objectContaining({ games: { 18: "source-unavailable" } }) },
      { job: "collect/cardmarket", status: 503, outcome: "refused:host-suspended", counts: { host: "downloads.s3.cardmarket.com", notBefore: null, suspendedAt: "2026-10-29T06:00:00.000Z", suspendedReason: "http-429" } },
      { job: "collect/cardmarket", status: 500, outcome: "unavailable:collection-could-not-start", counts: {} },
    ]);
    expect(JSON.stringify(ops.record.mock.calls)).not.toContain("ECONNREFUSED");
  });

  it("keeps the 270 s budget inside a 300 s function, the most any storefront route asks for", () => {
    expect(maxDuration).toBe(300);
    expect(maxDuration * 1000).toBeGreaterThan(CARDMARKET_COLLECT_BUDGET_MS);
  });
});
