import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptySkips } from "@/lib/market-derived/method";
import type { CardRushRunSummary } from "@/lib/datafeed/collectors/cardrush";
import {
  cardRushJobOutcome, declined, derivationJobOutcome, opsCounts, recordJobOutcome, recordedRun, tcgplayerJobOutcome,
} from "./job-outcomes";

vi.mock("server-only", () => ({}));

const run = vi.fn();
beforeEach(() => {
  run.mockReset().mockResolvedValue({ rows: [], rowCount: 1 });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("job outcome counts", () => {
  it("keeps whole counts, booleans, nulls and short tokens, one level deep, and drops the rest", () => {
    expect(opsCounts({
      rows: 12, ok: true, none: null, host: "www.cardrush-op.jp", asOf: "2026-11-05", at: "2026-11-05T07:00:00.000Z",
      price: 8.22, negative: -1, message: "relation users does not exist", list: [1, 2], undefinedValue: undefined,
      nested: { written: 3, amount: 1.5, deeper: { level: 3 }, "bad key": 1 }, "two words": 1,
    })).toEqual({ rows: 12, ok: true, none: null, host: "www.cardrush-op.jp", asOf: "2026-11-05", at: "2026-11-05T07:00:00.000Z", nested: { written: 3 } });
  });

  it("names a declined run refused or unavailable by what its code means", () => {
    expect(["run-in-progress", "request-spacing", "host-backing-off", "host-suspended", "out-of-order", "no-inputs", "release-revoked-or-unreviewed"].map(declined))
      .toEqual(["refused:run-in-progress", "refused:request-spacing", "refused:host-backing-off", "refused:host-suspended", "refused:out-of-order", "refused:no-inputs", "refused:release-revoked-or-unreviewed"]);
    expect(["lease-not-provisioned", "not-provisioned", "fx-unavailable", "no-set-written", "budget-exhausted"].map(declined))
      .toEqual(["unavailable:lease-not-provisioned", "unavailable:not-provisioned", "unavailable:fx-unavailable", "unavailable:no-set-written", "unavailable:budget-exhausted"]);
    expect(declined("Upstream said: go away")).toBe("unavailable:unexpected");
  });

  it("reads each job's report into an outcome and counts", () => {
    expect(cardRushJobOutcome({ ran: true, host: "www.cardrush-op.jp", runAt: "2026-11-05T00:15:00.000Z", requested: 103, observed: 98, quarantined: 5, sitemapProducts: 4000, robotsDisallowed: 2,
      batch: { id: "77", inserted: 98, duplicate: false }, crosswalks: { written: 4, unchanged: 90, skipped: 1, refused: 0 }, listingImages: { written: 98 }, hostState: { recorded: 1 } }))
      .toEqual({ outcome: "ran", counts: { host: "www.cardrush-op.jp", requested: 103, observed: 98, quarantined: 5, sitemapProducts: 4000, robotsDisallowed: 2,
        inserted: 98, duplicateBatch: false, crosswalks: { written: 4, unchanged: 90, skipped: 1, refused: 0 }, listingImagesWritten: 98, hostStateRecorded: 1 } });
    expect(cardRushJobOutcome({ ran: true, host: "www.cardrush-pokemon.jp", runAt: "x", requested: 0, observed: 0, quarantined: 0, unavailable: { code: "SOURCE_UNAVAILABLE", reason: "challenge-challenge" } }).outcome)
      .toBe("unavailable:challenge-challenge");
    expect(cardRushJobOutcome(null)).toEqual({ outcome: "unavailable:collector-failed", counts: {} });
    expect(tcgplayerJobOutcome({ ran: false, reason: "host-backing-off", host: "mpapi.tcgplayer.com", notBefore: "2026-11-05T13:00:00.000Z", suspendedAt: null, suspendedReason: null, runAt: "x", requests: 0 }))
      .toEqual({ outcome: "refused:host-backing-off", counts: { host: "mpapi.tcgplayer.com", notBefore: "2026-11-05T13:00:00.000Z", suspendedAt: null, suspendedReason: null } });
    expect(derivationJobOutcome({ ok: true, ran: false, reason: "already-derived", runId: "4", asOf: "2026-11-05", methodVersion: "ctcg.market-derived/v1" }))
      .toEqual({ outcome: "already-derived", counts: { asOf: "2026-11-05", methodVersion: "ctcg.market-derived/v1", runId: "4" } });
    const skipped = { ...emptySkips(), unmapped: 7 };
    expect(derivationJobOutcome({ ok: false, ran: false, reason: "no-inputs", detail: "No fresh headline observation placed in a set for 2026-11-05.", asOf: "2026-11-05", methodVersion: "ctcg.market-derived/v1", excludedSources: { cardmarket: "derivation-off" }, skipped }))
      .toEqual({ outcome: "refused:no-inputs", counts: { asOf: "2026-11-05", methodVersion: "ctcg.market-derived/v1", excludedSources: { cardmarket: "derivation-off" }, skipped: { unmapped: 7 } } });
  });
});

describe("recordJobOutcome", () => {
  const entry = { job: "derive/market" as const, startedAt: new Date("2026-11-05T07:00:00.000Z"), finishedAt: new Date("2026-11-05T07:00:41.000Z"), httpStatus: 200, outcome: "ran", counts: { written: { indices: 70 } } };

  it("writes one row, then sweeps rows past retention", async () => {
    expect(await recordJobOutcome(entry, run)).toEqual({ recorded: true });
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[0]).toEqual([expect.stringContaining("INSERT INTO ops_job_outcomes"),
      ["derive/market", "2026-11-05T07:00:00.000Z", "2026-11-05T07:00:41.000Z", 200, "ran", JSON.stringify({ written: { indices: 70 } })]]);
    expect(run.mock.calls[1]![0]).toMatch(/^WITH d0 AS \(DELETE FROM traffic_hourly/);
  });

  it("records nothing, quietly, before 0148, and logs only an error's name otherwise; it never throws", async () => {
    run.mockRejectedValueOnce(Object.assign(new Error('relation "ops_job_outcomes" does not exist'), { code: "42P01" }));
    expect(await recordJobOutcome(entry, run)).toEqual({ recorded: false, skipped: "not-provisioned" });
    expect(console.error).not.toHaveBeenCalled();
    run.mockRejectedValueOnce(Object.assign(new Error("password authentication failed for host 10.0.0.1"), { name: "PostgresError" }));
    expect(await recordJobOutcome(entry, run)).toEqual({ recorded: false, skipped: "failed" });
    expect(console.error).toHaveBeenCalledWith("[ops/job-outcomes] not recorded", "derive/market", "PostgresError");
    // A failed sweep leaves the row recorded.
    run.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error("statement timeout"));
    expect(await recordJobOutcome(entry, run)).toEqual({ recorded: true });
  });

  it("replaces an outcome outside the vocabulary rather than storing it", async () => {
    await recordJobOutcome({ ...entry, outcome: "refused:Upstream said no" }, run);
    expect(run.mock.calls[0]![1]![4]).toBe("unavailable:unexpected");
  });
});

describe("recordedRun", () => {
  it("answers with the work's own response, recorded after it", async () => {
    const response = new Response("{}", { status: 503 });
    const work = vi.fn(async (observe: (report: { ran: false; reason: string }) => void) => { observe({ ran: false, reason: "lease-not-provisioned" }); return response; });
    expect(await recordedRun("collect/cardmarket", work, () => ({ outcome: "unavailable:lease-not-provisioned", counts: {} }), run)).toBe(response);
    expect(run.mock.calls[0]![1]!.slice(0, 1)).toEqual(["collect/cardmarket"]);
    expect(run.mock.calls[0]![1]![3]).toBe(503);
  });

  it("records a throw as a 500 and rethrows it; a report it cannot read is left unrecorded", async () => {
    const boom = new Error("boom");
    await expect(recordedRun<CardRushRunSummary, Response>("collect/cardrush", async () => { throw boom; }, cardRushJobOutcome, run)).rejects.toBe(boom);
    expect(run.mock.calls[0]![1]!.slice(3, 5)).toEqual([500, "unavailable:collector-failed"]);
    run.mockClear();
    const response = new Response(null, { status: 200 });
    expect(await recordedRun("collect/cardrush", async () => response, () => { throw new TypeError("unreadable"); }, run)).toBe(response);
    expect(run).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("[ops/job-outcomes] not recorded", "collect/cardrush", "TypeError");
  });
});
