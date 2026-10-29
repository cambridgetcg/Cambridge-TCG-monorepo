import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { query, transaction } from "@/lib/db";
import { TCGPLAYER_RUN_BUDGET_MS } from "@/lib/datafeed/collectors/tcgplayer";
import { GET, maxDuration } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: vi.fn(), transaction: vi.fn() }));

const env = { secret: process.env.CRON_SECRET, flag: process.env.DATA_COLLECT_TCGPLAYER };
const network = vi.fn<typeof fetch>();
const call = (authorization = "Bearer test-cron-secret") =>
  GET(new Request("https://cambridgetcg.example/api/cron/collect/tcgplayer", { headers: { authorization } }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", network);
  process.env.CRON_SECRET = "test-cron-secret";
  delete process.env.DATA_COLLECT_TCGPLAYER;
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const [key, value] of [["CRON_SECRET", env.secret], ["DATA_COLLECT_TCGPLAYER", env.flag]] as const) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

/** The release row present and the lease free (or, with held, taken). */
const leased = (async (sql: string, params?: unknown[]) => {
  if (sql.includes("INSERT INTO price_collector_leases")) return { rows: [{ holder: params![1], held_by: null }], rowCount: 1 };
  if (sql.startsWith("UPDATE price_collector_leases")) return { rows: [], rowCount: 1 };
  return { rows: sql.includes("member_price_source_releases") ? [{ source: "tcgplayer" }] : [], rowCount: 0 };
}) as never;

describe("TCGplayer collector cron", () => {
  it("authenticates before anything else, even with the flag on", async () => {
    process.env.DATA_COLLECT_TCGPLAYER = "on";
    expect((await call("Bearer wrong")).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await call()).status).toBe(503);
    expect(network).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "off", "ON", "true", "1", " on"])("is disabled for DATA_COLLECT_TCGPLAYER=%j and touches neither network nor database", async (flag) => {
    if (flag !== undefined) process.env.DATA_COLLECT_TCGPLAYER = flag;
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ran: false, reason: "disabled" });
    expect(network).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("keeps the 270 s run inside a 300 s function, the most any storefront route asks for", () => {
    expect(maxDuration).toBe(300);
    expect(maxDuration * 1000).toBeGreaterThan(TCGPLAYER_RUN_BUDGET_MS);
  });

  it("when on, checks the release row before any request to TCGplayer", async () => {
    process.env.DATA_COLLECT_TCGPLAYER = "on";
    vi.mocked(query).mockResolvedValue({ rows: [], rowCount: 0 } as never);
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: false, ran: true, run: { status: "release-revoked-or-unreviewed", requests: 0 } });
    expect(network).not.toHaveBeenCalled();
  });

  it("when TCGplayer refuses the identified collector, reports SOURCE_UNAVAILABLE and stops", async () => {
    process.env.DATA_COLLECT_TCGPLAYER = "on";
    vi.mocked(query).mockImplementation(leased);
    network.mockResolvedValue(new Response("Too many requests", { status: 429, headers: { "retry-after": "60" } }));
    const response = await call();
    expect(response.status).toBe(503);
    // The run's first request is www.tcgplayer.com's robots.txt, read every run.
    expect(await response.json()).toMatchObject({
      ok: false, ran: true, error: { code: "SOURCE_UNAVAILABLE" },
      run: { status: "source-unavailable", requests: 1, unavailable: { reason: "robots-http-429", status: 429, url: "https://www.tcgplayer.com/robots.txt", refused: true } },
    });
    expect(network).toHaveBeenCalledTimes(1);
    expect(network.mock.calls[0]![0]).toBe("https://www.tcgplayer.com/robots.txt");
    expect(new Headers(network.mock.calls[0]![1]!.headers).get("user-agent")).toContain("permission tcgplayer/2026-10-28.1");
    expect(transaction).not.toHaveBeenCalled();
    // The lease was taken before the first request, the hosts' state read under it, the
    // refusal recorded against the host, and the lease given back keeping the 10 s Crawl-Delay.
    expect(vi.mocked(query).mock.calls.map(([sql]) => sql.split(" ")[0])).toEqual(["SELECT", "WITH", "SELECT", "INSERT", "UPDATE"]);
    expect(vi.mocked(query).mock.calls[1]![1]![0]).toBe("tcgplayer");
    expect(vi.mocked(query).mock.calls[2]![0]).toContain("FROM price_collector_hosts");
    const recorded = JSON.parse(vi.mocked(query).mock.calls[3]![1]![1] as string);
    expect(recorded).toEqual([expect.objectContaining({ host: "www.tcgplayer.com", consecutiveRefusals: 1, lastRefusalReason: "robots-http-429", suspendedAt: null })]);
    // Retry-After: 60 is waited out before the next run asks again.
    expect(Date.parse(recorded[0].notBefore) - Date.parse(recorded[0].lastRefusalAt)).toBe(60_000);
    expect(vi.mocked(query).mock.calls[4]![1]).toEqual(["tcgplayer", expect.any(String), "request-spacing", 10_000]);
  });

  it.each([
    ["backing off", { not_before: "2999-01-01T00:00:00.000Z", suspended_at: null, suspended_reason: null }, 200, { ok: true, ran: false, reason: "host-backing-off", host: "mpapi.tcgplayer.com", notBefore: "2999-01-01T00:00:00.000Z" }],
    ["suspended", { not_before: "2026-10-29T06:00:00.000Z", suspended_at: "2026-10-29T00:00:00.000Z", suspended_reason: "http-403" }, 503,
      { ok: false, ran: false, reason: "host-suspended", host: "mpapi.tcgplayer.com", suspendedAt: "2026-10-29T00:00:00.000Z", suspendedReason: "http-403", error: { code: "HOST_SUSPENDED" } }],
  ] as const)("asks TCGplayer nothing while a host is %s", async (_label, state, status, body) => {
    process.env.DATA_COLLECT_TCGPLAYER = "on";
    vi.mocked(query).mockImplementation((async (sql: string, params?: unknown[]) => {
      if (sql.includes("FROM price_collector_hosts")) return { rows: [{ source: "tcgplayer", host: "mpapi.tcgplayer.com", consecutive_refusals: 3, last_success_at: null, last_refusal_at: "2026-10-29T00:00:00.000Z", last_refusal_reason: "http-403", ...state }], rowCount: 1 };
      return (leased as unknown as (sql: string, params?: unknown[]) => Promise<unknown>)(sql, params);
    }) as never);
    const response = await call();
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject(body);
    expect(network).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("answers the budget's timeout cutting a request short as a budget stop, not a 500, and not as success when no set was written", async () => {
    process.env.DATA_COLLECT_TCGPLAYER = "on";
    vi.mocked(query).mockImplementation(leased);
    network.mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    const response = await call();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, ran: true, error: { code: "NO_SET_WRITTEN" }, run: { status: "no-set-written", stoppedBy: "budget", requests: 1, errors: [] } });
    expect(network).toHaveBeenCalledTimes(1);
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([["another-run", "run-in-progress"], ["request-spacing", "request-spacing"]])("answers ran:false while the lease is held by %s, before any request", async (heldBy, reason) => {
    process.env.DATA_COLLECT_TCGPLAYER = "on";
    vi.mocked(query).mockImplementation((async (sql: string) => ({
      rows: sql.includes("member_price_source_releases") ? [{ source: "tcgplayer" }] : sql.includes("INSERT INTO price_collector_leases") ? [{ holder: null, held_by: heldBy }] : [],
      rowCount: 0,
    })) as never);
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ran: false, reason });
    expect(network).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("never runs unleased: a store without the lease table answers 503", async () => {
    process.env.DATA_COLLECT_TCGPLAYER = "on";
    vi.mocked(query).mockImplementation((async (sql: string) => {
      if (sql.includes("INSERT INTO price_collector_leases")) throw Object.assign(new Error('relation "price_collector_leases" does not exist'), { code: "42P01" });
      return { rows: [{ source: "tcgplayer" }], rowCount: 1 };
    }) as never);
    const response = await call();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, ran: false, reason: "lease-not-provisioned", error: { code: "NOT_PROVISIONED" } });
    expect(network).not.toHaveBeenCalled();
  });
});
