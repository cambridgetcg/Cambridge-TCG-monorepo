import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  derive: vi.fn(),
  quotes: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/cron-auth", () => ({ requireCronAuth: mocks.auth }));
vi.mock("@/lib/market-derived/derive", () => ({ runMarketDerivation: mocks.derive }));
vi.mock("@/lib/fx/rates", () => ({ fetchEcbEuroQuotes: mocks.quotes }));
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

const request = () => new Request("https://cambridgetcg.com/api/cron/derive/market");
const quotes = { source: "ecb.europa.eu", as_of: "2026-10-27", fetched_at: "2026-10-28T07:00:00.000Z", perEur: { GBP: "0.8672", JPY: "162.53", USD: "1.0812" } };

beforeEach(() => {
  vi.clearAllMocks();
  ops.record.mockReset().mockResolvedValue({ rows: [], rowCount: 1 });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.auth.mockReturnValue(null);
  mocks.quotes.mockResolvedValue(quotes);
  vi.stubEnv("DATA_DERIVE_MARKET", "on");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("market derivation cron", () => {
  it("runs nothing when cron auth denies", async () => {
    const denied = new Response("denied", { status: 401 });
    mocks.auth.mockReturnValue(denied);
    expect(await GET(request())).toBe(denied);
    expect(mocks.quotes).not.toHaveBeenCalled();
    expect(mocks.derive).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "off", "ON", "true", " on"])("stays inert with DATA_DERIVE_MARKET=%j: no database, no ECB", async flag => {
    if (flag === undefined) vi.stubEnv("DATA_DERIVE_MARKET", undefined as unknown as string);
    else vi.stubEnv("DATA_DERIVE_MARKET", flag);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ ok: true, ran: false, reason: "disabled" });
    expect(mocks.quotes).not.toHaveBeenCalled();
    expect(mocks.derive).not.toHaveBeenCalled();
  });

  it("derives today's UTC date with ECB's quotes when on", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-28T23:30:00-05:00"), toFake: ["Date"] });
    mocks.derive.mockResolvedValue({ ok: true, ran: true, asOf: "2026-10-29", runId: "7" });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, ran: true, runId: "7" });
    expect(mocks.derive).toHaveBeenCalledOnce();
    const [input] = mocks.derive.mock.calls[0]!;
    expect(input).toMatchObject({ asOf: "2026-10-29", fx: quotes });
    expect(input.now.toISOString()).toBe("2026-10-29T04:30:00.000Z");
  });

  it("answers a repeat run as already derived, still a success", async () => {
    mocks.derive.mockResolvedValue({ ok: true, ran: false, reason: "already-derived", runId: "7" });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ran: false, reason: "already-derived" });
  });

  it.each(["not-provisioned", "fx-unavailable", "no-inputs", "out-of-order"])("reports %s as a 503, never an empty success", async reason => {
    mocks.derive.mockResolvedValue({ ok: false, ran: false, reason, detail: "why" });
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, ran: false, reason });
  });

  it("passes an unreadable ECB through as null for the job to refuse", async () => {
    mocks.quotes.mockResolvedValue(null);
    mocks.derive.mockResolvedValue({ ok: false, ran: false, reason: "fx-unavailable", detail: "ECB quotes are unavailable." });
    expect((await GET(request())).status).toBe(503);
    expect(mocks.derive.mock.calls[0]![0].fx).toBeNull();
  });

  it("fails with 503 and no detail of the error when the job throws", async () => {
    mocks.derive.mockRejectedValue(Object.assign(new Error("relation secret_table at host db.internal"), { name: "PostgresError" }));
    const response = await GET(request());
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(JSON.parse(body)).toMatchObject({ ok: false, ran: false, reason: "unavailable" });
    expect(body).not.toContain("db.internal");
    expect(console.error).toHaveBeenCalledWith("[cron/derive/market] unavailable", "PostgresError");
  });

  it("records nothing while disabled", async () => {
    vi.stubEnv("DATA_DERIVE_MARKET", "off");
    await GET(request());
    expect(ops.record).not.toHaveBeenCalled();
  });

  it("records a run's exclusions, skips, rows and FX dates after the derivation, never a rate", async () => {
    mocks.derive.mockResolvedValue({
      ok: true, ran: true, asOf: "2026-11-05", methodVersion: "ctcg.market-derived/v1", runId: "9", inputBatchCeiling: "412",
      inputEvidence: { cardrush: "cardrush/2026-10-28.1", tcgplayer: "tcgplayer/2026-10-28.1" },
      fx: { JPY: { rate: "187.419280442804", source: "ecb.europa.eu", as_of: "2026-11-04" }, USD: { rate: "1.245387453875", source: "ecb.europa.eu", as_of: "2026-11-04" } },
      excludedSources: { cardmarket: "evidence-mismatch" },
      written: { references: 0, indices: 70, premiums: 35 },
      skipped: { notHeadline: 0, unmapped: 120, referenceSingleSource: 44 },
    });
    expect((await GET(request())).status).toBe(200);
    expect(outcomes()).toEqual([{ job: "derive/market", status: 200, outcome: "ran", counts: {
      asOf: "2026-11-05", methodVersion: "ctcg.market-derived/v1", runId: "9", inputBatchCeiling: "412",
      sources: { cardrush: true, tcgplayer: true }, excludedSources: { cardmarket: "evidence-mismatch" },
      written: { references: 0, indices: 70, premiums: 35 }, skipped: { unmapped: 120, referenceSingleSource: 44 },
      fxDates: { JPY: "2026-11-04", USD: "2026-11-04" },
    } }]);
    expect(JSON.stringify(ops.record.mock.calls)).not.toMatch(/187\.41|1\.2453/);
    // After the derivation's own transaction, not inside it.
    expect(mocks.derive.mock.invocationCallOrder[0]).toBeLessThan(ops.record.mock.invocationCallOrder[0]!);
  });

  it.each([
    ["already-derived", true, "already-derived", 200],
    ["not-provisioned", false, "unavailable:not-provisioned", 503],
    ["fx-unavailable", false, "unavailable:fx-unavailable", 503],
    ["no-inputs", false, "refused:no-inputs", 503],
    ["out-of-order", false, "refused:out-of-order", 503],
  ] as const)("records %s as %s", async (reason, ok, outcome, status) => {
    mocks.derive.mockResolvedValue({ ok, ran: false, reason, asOf: "2026-11-05", methodVersion: "ctcg.market-derived/v1", runId: "9", detail: "A run for 2026-11-06 already exists; dates are derived in order." });
    expect((await GET(request())).status).toBe(status);
    expect(outcomes()).toEqual([{ job: "derive/market", status, outcome, counts: expect.objectContaining({ asOf: "2026-11-05" }) }]);
    // The detail is prose: it stays in the response, not in the row.
    expect(JSON.stringify(ops.record.mock.calls)).not.toContain("derived in order");
  });

  it("records a derivation that threw, and answers the same when the outcome cannot be written", async () => {
    mocks.derive.mockRejectedValue(Object.assign(new Error("relation secret_table at host db.internal"), { name: "PostgresError" }));
    ops.record.mockRejectedValueOnce(new Error("too many connections"));
    const failedWrite = await GET(request());
    expect(failedWrite.status).toBe(503);
    expect(await failedWrite.json()).toMatchObject({ ok: false, ran: false, reason: "unavailable" });
    expect(console.error).toHaveBeenCalledWith("[ops/job-outcomes] not recorded", "derive/market", "Error");
    await GET(request());
    expect(outcomes().at(-1)).toEqual({ job: "derive/market", status: 503, outcome: "unavailable:error", counts: {} });
    expect(JSON.stringify(ops.record.mock.calls)).not.toContain("db.internal");
  });

  it("allows a long cron run", () => {
    expect(maxDuration).toBe(300);
  });
});
