import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => db);
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
import { CARDRUSH_MAX_BUDGET_MS } from "@cambridge-tcg/data-ingest/cardrush/member-prices";
import { GET, maxDuration } from "./route";

const request = (authorization?: string) =>
  new Request("https://example.test/api/cron/collect/cardrush", authorization ? { headers: { authorization } } : {});
let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "fixture-cron-secret");
  db.query.mockReset(); db.transaction.mockReset();
  ops.record.mockReset().mockResolvedValue({ rows: [], rowCount: 1 });
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => { throw new Error("the collector route must not reach the network here"); });
});
afterEach(() => { vi.unstubAllEnvs(); fetchSpy.mockRestore(); });

describe("CardRush collector cron", () => {
  it("authenticates before anything else, flag or not", async () => {
    vi.stubEnv("DATA_COLLECT_CARDRUSH", "on");
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(db.query).not.toHaveBeenCalled(); expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "off", "ON", "true", "1", " on"])("stays off unless DATA_COLLECT_CARDRUSH is exactly on (%j)", async (flag) => {
    if (flag !== undefined) vi.stubEnv("DATA_COLLECT_CARDRUSH", flag);
    const response = await GET(request("Bearer fixture-cron-secret"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, ran: false, reason: "disabled" });
    expect(db.query).not.toHaveBeenCalled(); expect(db.transaction).not.toHaveBeenCalled(); expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("when on, checks the release row before any network work", async () => {
    vi.stubEnv("DATA_COLLECT_CARDRUSH", "on");
    db.query.mockResolvedValue({ rows: [], rowCount: 0 });
    const response = await GET(request("Bearer fixture-cron-secret"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, ran: false, reason: "release-revoked-or-unreviewed", requested: 0 });
    expect(db.query).toHaveBeenCalledOnce();
    expect(db.query.mock.calls[0]![1]).toEqual(["cardrush/2026-10-28.1", "repo:docs/decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md#cardrush"]);
    expect(fetchSpy).not.toHaveBeenCalled(); expect(db.transaction).not.toHaveBeenCalled();
  });

  it("keeps the 270 s run inside a 300 s function, the most any storefront route asks for", () => {
    expect(maxDuration).toBe(300);
    expect(maxDuration * 1000).toBeGreaterThan(CARDRUSH_MAX_BUDGET_MS);
  });

  it.each(["run-in-progress", "request-spacing"])("when the host's lease is held (%s), answers ran:false before any network work", async (reason) => {
    vi.stubEnv("DATA_COLLECT_CARDRUSH", "on");
    const heldBy = reason === "request-spacing" ? "request-spacing" : "another-run";
    db.query.mockImplementation(async (sql: string) => sql.includes("INSERT INTO price_collector_leases") ? { rows: [{ holder: null, held_by: heldBy }], rowCount: 1 } : { rows: [{ source: "cardrush" }], rowCount: 1 });
    const response = await GET(request("Bearer fixture-cron-secret"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, ran: false, reason, requested: 0 });
    expect(db.query.mock.calls.map(([sql]) => sql.split(" ")[0])).toEqual(["SELECT", "WITH"]);
    expect(db.query.mock.calls[1]![1]![0]).toMatch(/^cardrush:www\.cardrush-[a-z]+\.jp$/);
    expect(fetchSpy).not.toHaveBeenCalled(); expect(db.transaction).not.toHaveBeenCalled();
  });

  it("never runs unleased: a store without the lease table answers 503", async () => {
    vi.stubEnv("DATA_COLLECT_CARDRUSH", "on");
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO price_collector_leases")) throw Object.assign(new Error('relation "price_collector_leases" does not exist'), { code: "42P01" });
      return { rows: [{ source: "cardrush" }], rowCount: 1 };
    });
    const response = await GET(request("Bearer fixture-cron-secret"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, ran: false, reason: "lease-not-provisioned", error: { code: "NOT_PROVISIONED" } });
    expect(fetchSpy).not.toHaveBeenCalled(); expect(db.transaction).not.toHaveBeenCalled();
  });

  it("answers a host's refusal as 503 SOURCE_UNAVAILABLE, not ok, and records it as the host's batch", async () => {
    vi.stubEnv("DATA_COLLECT_CARDRUSH", "on");
    const tx = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes("FROM member_price_source_releases")) return { rows: [{ source: "cardrush" }], rowCount: 1 };
      if (sql.startsWith("SELECT id::text FROM member_price_batches")) return { rows: [], rowCount: 0 };
      if (sql.startsWith("INSERT INTO member_price_batches")) return { rows: [{ id: "31" }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    db.transaction.mockImplementation(async (work: (query: typeof tx) => unknown) => work(tx));
    db.query.mockImplementation(async (sql: string, params?: unknown[]) =>
      sql.includes("INSERT INTO price_collector_leases") ? { rows: [{ holder: params![1], held_by: null }], rowCount: 1 } : { rows: [{ source: "cardrush" }], rowCount: 1 });
    // The host challenges its robots.txt: the run stops there.
    fetchSpy.mockImplementation(async () => new Response("<html><title>Just a moment...</title></html>", { status: 403, headers: { "content-type": "text/html", server: "cloudflare", "cf-mitigated": "challenge" } }));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const response = await GET(request("Bearer fixture-cron-secret"));
    log.mockRestore();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, ran: true, requested: 0, error: { code: "SOURCE_UNAVAILABLE" }, unavailable: { code: "SOURCE_UNAVAILABLE" }, batch: { id: "31" } });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const inserted = tx.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO member_price_batches"))!;
    expect(inserted[1]).toEqual([`cardrush:${body.host}:${body.runAt}`, "cardrush", 0, 0, JSON.stringify([{ sourceProductId: null, field: "host", reason: body.unavailable.reason }])]);
  });

  it("answers a suspended host as 503 HOST_SUSPENDED and one backing off as ran:false, asking it nothing", async () => {
    vi.stubEnv("DATA_COLLECT_CARDRUSH", "on");
    for (const [state, status, body] of [
      [{ not_before: "2999-01-01T00:00:00.000Z", suspended_at: null, suspended_reason: null }, 200, { ok: true, ran: false, reason: "host-backing-off", notBefore: "2999-01-01T00:00:00.000Z" }],
      [{ not_before: "2026-10-29T06:00:00.000Z", suspended_at: "2026-10-29T00:00:00.000Z", suspended_reason: "challenge-challenge" }, 503,
        { ok: false, ran: false, reason: "host-suspended", suspendedAt: "2026-10-29T00:00:00.000Z", suspendedReason: "challenge-challenge", error: { code: "HOST_SUSPENDED" } }],
    ] as const) {
      db.query.mockImplementation(async (sql: string, params?: unknown[]) => {
        if (sql.includes("INSERT INTO price_collector_leases")) return { rows: [{ holder: params![1], held_by: null }], rowCount: 1 };
        if (sql.includes("FROM price_collector_hosts")) return { rows: (params![1] as string[]).map(host => ({ source: "cardrush", host, consecutive_refusals: 3, last_success_at: null, last_refusal_at: "2026-10-29T00:00:00.000Z", last_refusal_reason: "challenge-challenge", ...state })), rowCount: 1 };
        return { rows: [{ source: "cardrush" }], rowCount: 1 };
      });
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const response = await GET(request("Bearer fixture-cron-secret"));
      log.mockRestore();
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ ...body, requested: 0 });
    }
    expect(fetchSpy).not.toHaveBeenCalled(); expect(db.transaction).not.toHaveBeenCalled();
  });

  it("records each enabled run's outcome after it, and nothing for a disabled run", async () => {
    const response = await GET(request("Bearer fixture-cron-secret"));
    expect(await response.json()).toEqual({ ok: true, ran: false, reason: "disabled" });
    expect(ops.record).not.toHaveBeenCalled();

    vi.stubEnv("DATA_COLLECT_CARDRUSH", "on");
    db.query.mockImplementation(async (sql: string) => sql.includes("INSERT INTO price_collector_leases") ? { rows: [{ holder: null, held_by: "another-run" }], rowCount: 1 } : { rows: [{ source: "cardrush" }], rowCount: 1 });
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect((await GET(request("Bearer fixture-cron-secret"))).status).toBe(200);
    db.query.mockResolvedValue({ rows: [], rowCount: 0 });
    expect((await GET(request("Bearer fixture-cron-secret"))).status).toBe(200);
    expect(outcomes()).toEqual([
      { job: "collect/cardrush", status: 200, outcome: "refused:run-in-progress", counts: { host: expect.stringMatching(/^www\.cardrush-[a-z]+\.jp$/), requested: 0 } },
      { job: "collect/cardrush", status: 200, outcome: "refused:release-revoked-or-unreviewed", counts: { host: expect.any(String), requested: 0 } },
    ]);
    // The row is written after the work, never into the collector's own statements.
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes("ops_job_outcomes"))).toBe(false);
  });

  it("records a collector that threw as unavailable, and a failed outcome write changes no answer", async () => {
    vi.stubEnv("DATA_COLLECT_CARDRUSH", "on");
    db.query.mockRejectedValue(new Error("connection to 10.0.0.1 refused"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await GET(request("Bearer fixture-cron-secret"))).status).toBe(500);
    expect(outcomes()).toEqual([{ job: "collect/cardrush", status: 500, outcome: "unavailable:collector-failed", counts: {} }]);
    expect(JSON.stringify(ops.record.mock.calls)).not.toContain("10.0.0.1");

    ops.record.mockRejectedValue(Object.assign(new Error("relation does not exist"), { code: "42P01" }));
    db.query.mockResolvedValue({ rows: [], rowCount: 0 });
    const response = await GET(request("Bearer fixture-cron-secret"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, ran: false, reason: "release-revoked-or-unreviewed" });
    error.mockRestore();
  });

  it("answers a failure without echoing it", async () => {
    vi.stubEnv("DATA_COLLECT_CARDRUSH", "on");
    db.query.mockRejectedValue(new Error("connection to 10.0.0.1 refused"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await GET(request("Bearer fixture-cron-secret"));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("10.0.0.1");
    error.mockRestore();
  });
});
