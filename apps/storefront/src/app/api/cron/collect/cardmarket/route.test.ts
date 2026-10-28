import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CARDMARKET_EVIDENCE_VERSION } from "@cambridge-tcg/data-ingest/member-prices";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), collect: vi.fn(), query: vi.fn(), transaction: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/cron-auth", () => ({ requireCronAuth: mocks.auth }));
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: mocks.transaction }));
vi.mock("@/lib/datafeed/cardmarket-collector", () => ({ collectCardmarketMemberPrices: mocks.collect, CARDMARKET_COLLECT_BUDGET_MS: 270_000 }));
import { GET, maxDuration } from "./route";
import { CARDMARKET_COLLECT_BUDGET_MS } from "@/lib/datafeed/cardmarket-collector";

const request = () => new Request("https://cambridgetcg.com/api/cron/collect/cardmarket");
const fetchSpy = vi.fn();
const summary = (ok: boolean) => ({ ran: true, ok, source: "cardmarket", evidenceVersion: CARDMARKET_EVIDENCE_VERSION, budgetMs: 270_000, elapsedMs: 12, games: [{ gameId: 18, game: "one-piece", status: ok ? "completed" : "source-unavailable" }], setCrosswalks: { status: "completed", rows: 55, written: 0, superseded: 0, unchanged: 55 } });

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
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

  it("keeps an unexpected failure's text out of the response", async () => {
    vi.stubEnv("DATA_COLLECT_CARDMARKET", "on");
    mocks.collect.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.1:5432 password=..."));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("ECONNREFUSED");
  });

  it("keeps the 270 s budget inside a 300 s function, the most any storefront route asks for", () => {
    expect(maxDuration).toBe(300);
    expect(maxDuration * 1000).toBeGreaterThan(CARDMARKET_COLLECT_BUDGET_MS);
  });
});
