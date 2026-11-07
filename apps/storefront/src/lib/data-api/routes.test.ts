import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: vi.fn(), transaction: vi.fn() }));
const mocks = vi.hoisted(() => ({ bearer: vi.fn(), reference: vi.fn(), history: vi.fn(), indices: vi.fn(), premiums: vi.fn(), export: vi.fn() }));
vi.mock("@/lib/data-api/bearer", () => ({ resolveDataApiBearer: mocks.bearer }));
vi.mock("@/lib/data-api/reads", async () => ({
  ...await vi.importActual<typeof import("./reads")>("./reads"),
  readReferencePrices: mocks.reference, readReferenceHistory: mocks.history, readMarketIndices: mocks.indices,
  readMarketPremiums: mocks.premiums, readDerivedExport: mocks.export,
}));
import { DERIVED_MARKET_METHOD_VERSION as METHOD } from "@cambridge-tcg/data-spec";
import * as reference from "@/app/api/v1/market/reference/route";
import * as history from "@/app/api/v1/market/reference/history/route";
import * as indices from "@/app/api/v1/market/indices/route";
import * as premiums from "@/app/api/v1/market/premiums/route";
import * as exported from "@/app/api/v1/market/export/route";
import * as usage from "@/app/api/v1/account/usage/route";
import * as plans from "@/app/api/v1/plans/route";
import { entitlementFor, type DataApiEntitlement } from "./plans";
import { DataApiQueryError, type DerivedPage } from "./reads";

const routes = { "/api/v1/market/reference": reference, "/api/v1/market/reference/history": history, "/api/v1/market/indices": indices,
  "/api/v1/market/premiums": premiums, "/api/v1/market/export": exported, "/api/v1/account/usage": usage } as const;
const readers = { "/api/v1/market/reference": mocks.reference, "/api/v1/market/reference/history": mocks.history, "/api/v1/market/indices": mocks.indices,
  "/api/v1/market/premiums": mocks.premiums, "/api/v1/market/export": mocks.export } as const;
const queries: Record<keyof typeof readers, string> = {
  "/api/v1/market/reference": "sku=op-op01-001-en", "/api/v1/market/reference/history": "sku=op-op01-001-en", "/api/v1/market/indices": "game=one-piece",
  "/api/v1/market/premiums": "game=one-piece", "/api/v1/market/export": "date=2026-10-27",
};
const request = (path: string, authorization?: string) => new Request(`https://cambridgetcg.com${path}`, { headers: authorization ? { authorization } : {} });
const accepted = (entitlement: DataApiEntitlement = entitlementFor("pro")) => ({
  ok: true, actor: { userId: "member" }, entitlement,
  minute: { limit: entitlement.requestsPerMinutePerKey, remaining: 7, resetSeconds: 20 },
  month: { start: "2026-10-01", limit: entitlement.requestsPerMonthPerAccount, remaining: 900, used: 100, resetSeconds: 400_000 },
});
const ref = { runId: "7", methodVersion: METHOD, asOf: "2026-10-27", sku: "op-op01-001-en", game: "one-piece", setCode: "op01", amount: "12.4", currency: "GBP", confidence: "medium", sources: ["cardrush", "tcgplayer"], sourceCount: 2 };
const page = <T>(items: T[], fields: Partial<DerivedPage<T>> = {}): DerivedPage<T> => ({
  status: items.length ? "available" : "empty", items, nextCursor: null, ceiling: "9", asOf: "2026-10-28T12:00:00.000Z", count: items.length, complete: true,
  history: { days: null, start: null, clipped: false }, ...fields,
});
function privateResponse(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.has("access-control-allow-origin")).toBe(false);
}
beforeEach(() => {
  vi.clearAllMocks();
  // Published, unless a test says otherwise (see "publication comes first").
  vi.stubEnv("DATA_API_READS", "on");
  mocks.bearer.mockResolvedValue({ ok: false, status: 401 });
  for (const read of Object.values(readers)) read.mockResolvedValue(page([ref]));
  mocks.indices.mockResolvedValue(page([{ point: { ...ref, sources: ["cardmarket"] }, changes: { d7: null, d30: null, d90: null } }]));
  mocks.export.mockResolvedValue({ ...page([{ type: "reference", ...ref }]), run: null, total: 1 });
});
afterEach(() => vi.unstubAllEnvs());

describe("publication comes first", () => {
  it.each([undefined, "", "off", "ON", "true", " on", "yes"])("with DATA_API_READS=%j every read and usage answers 404 NOT_PUBLISHED, uncounted and unread", async flag => {
    vi.stubEnv("DATA_API_READS", flag as string);
    mocks.bearer.mockResolvedValue(accepted());
    for (const path of Object.keys(routes)) {
      const response = await routes[path as keyof typeof routes].GET(request(`${path}?limit=bad`, "Bearer x"));
      expect(response.status, path).toBe(404); privateResponse(response);
      expect(await response.json()).toEqual({ error: "The data API is not published.", code: "NOT_PUBLISHED" });
    }
    // The key is never looked up, so no minute or month is counted.
    expect(mocks.bearer).not.toHaveBeenCalled();
    for (const read of Object.values(readers)) expect(read).not.toHaveBeenCalled();
  });

  it("leaves the plan catalogue to its own switch", async () => {
    vi.stubEnv("DATA_API_READS", "off");
    vi.stubEnv("DATA_API_PLANS_PUBLISHED", "on");
    expect((await plans.GET()).status).toBe(200);
    vi.stubEnv("DATA_API_READS", "on");
    vi.stubEnv("DATA_API_PLANS_PUBLISHED", "off");
    expect((await plans.GET()).status).toBe(404);
  });
});

describe("data-API routes authenticate before anything else", () => {
  it.each(Object.keys(routes))("%s answers 401 without a key, before parsing or reading", async path => {
    const response = await routes[path as keyof typeof routes].GET(request(`${path}?limit=bad`));
    expect(response.status).toBe(401); privateResponse(response);
    expect(response.headers.get("www-authenticate")).toBe('Bearer realm="data-api"');
    expect(await response.json()).toEqual({ error: "A valid member price-read key is required.", code: "UNAUTHORIZED" });
    for (const read of Object.values(readers)) expect(read).not.toHaveBeenCalled();
  });

  it("answers 429 with the window, limit and reset, before reading", async () => {
    mocks.bearer.mockResolvedValue({ ok: false, status: 429, window: "month", limit: 100_000, resetSeconds: 400_000, entitlement: entitlementFor(null),
      minute: { limit: 30, remaining: 29, resetSeconds: 20 }, month: { start: "2026-10-01", limit: 100_000, remaining: 0, used: 100_000, resetSeconds: 400_000 } });
    const response = await reference.GET(request("/api/v1/market/reference?sku=op-op01-001-en", "Bearer x"));
    expect(response.status).toBe(429); privateResponse(response);
    expect(response.headers.get("retry-after")).toBe("400000");
    expect(response.headers.get("x-ratelimit-month-remaining")).toBe("0");
    expect(await response.json()).toMatchObject({ code: "RATE_LIMITED", window: "month", limit: 100_000, resetSeconds: 400_000 });
    expect(mocks.reference).not.toHaveBeenCalled();
  });

  it.each([["NOT_PROVISIONED", "NOT_PROVISIONED"], ["UNAVAILABLE", "SOURCE_UNAVAILABLE"]])("maps a %s bearer to 503 %s", async (code, published) => {
    mocks.bearer.mockResolvedValue({ ok: false, status: 503, code });
    const response = await usage.GET(request("/api/v1/account/usage", "Bearer x"));
    expect(response.status).toBe(503); privateResponse(response);
    expect((await response.json()).code).toBe(published);
  });

  it.each(Object.keys(routes))("%s allows only GET", async path => {
    const route = routes[path as keyof typeof routes] as unknown as Record<string, () => Response>;
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) expect(route[method]!().status, method).toBe(405);
  });
});

describe("authenticated data-API responses", () => {
  it("envelope derived pages with the rights note, plan and rate-limit headers", async () => {
    mocks.bearer.mockResolvedValue(accepted());
    mocks.reference.mockResolvedValue(page([ref], { nextCursor: "next.cursor", complete: false }));
    const response = await reference.GET(request("/api/v1/market/reference?game=one-piece&set=op01", "Bearer x"));
    expect(response.status).toBe(200); privateResponse(response);
    expect(response.headers.get("x-ratelimit-limit")).toBe("120");
    expect(response.headers.get("x-ratelimit-remaining")).toBe("7");
    expect(response.headers.get("x-ratelimit-month-limit")).toBe("1000000");
    const body = await response.json();
    expect(body.data.items).toEqual([ref]);
    expect(body._meta).toMatchObject({
      license: "NOASSERTION", sources: ["cardrush", "tcgplayer"], derived_market_contract: METHOD, plan: "pro",
      data_rights: "Cambridge-derived market data (ctcg.market-derived/v1). Not CC0 and not licensed for AI training. Offered under Cambridge data-API terms, which are pending.",
      next_link: "/api/v1/market/reference?game=one-piece&set=op01&cursor=next.cursor",
    });
    expect(body._meta.does_not_include[0]).toContain("A provider's own price");
    expect(mocks.reference).toHaveBeenCalledWith({ userId: "member" }, accepted().entitlement, { form: "set", game: "one-piece", set: "op01", limit: 100 });
  });

  it.each(Object.keys(readers))("%s reports not-provisioned and unavailable reads as 503, never as empty success", async path => {
    mocks.bearer.mockResolvedValue(accepted());
    const read = readers[path as keyof typeof readers];
    for (const [status, code] of [["not-provisioned", "NOT_PROVISIONED"], ["unavailable", "SOURCE_UNAVAILABLE"]] as const) {
      read.mockResolvedValueOnce({ ...page([], { status, complete: false }), run: null, total: 0 });
      const response = await routes[path as keyof typeof readers].GET(request(`${path}?${queries[path as keyof typeof readers]}`, "Bearer x"));
      expect(response.status).toBe(503); privateResponse(response);
      expect((await response.json()).code).toBe(code);
      expect(response.headers.get("x-ratelimit-limit")).toBe("120");
    }
  });

  it("gates each route by its plan feature, including the export", async () => {
    const without = (feature: string): DataApiEntitlement => ({ ...entitlementFor("pro"), features: entitlementFor("pro").features.filter(f => f !== feature) });
    mocks.bearer.mockResolvedValue(accepted(without("daily-export")));
    const response = await exported.GET(request("/api/v1/market/export?date=2026-10-27", "Bearer x"));
    expect(response.status).toBe(403); privateResponse(response);
    expect(await response.json()).toMatchObject({ code: "INSUFFICIENT_TIER", feature: "daily-export" });
    expect(mocks.export).not.toHaveBeenCalled();
    expect((await reference.GET(request("/api/v1/market/reference?sku=op-op01-001-en", "Bearer x"))).status).toBe(200);
    mocks.bearer.mockResolvedValue(accepted(without("indices")));
    expect((await indices.GET(request("/api/v1/market/indices?game=one-piece", "Bearer x"))).status).toBe(403);
    expect(mocks.indices).not.toHaveBeenCalled();
  });

  it("answers invalid queries 400 and out-of-window dates 403, with rate headers", async () => {
    mocks.bearer.mockResolvedValue(accepted());
    const invalid = await history.GET(request("/api/v1/market/reference/history?sku=op-op01-001-en&mode=history", "Bearer x"));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ code: "INVALID_INPUT" });
    expect(invalid.headers.get("x-ratelimit-limit")).toBe("120");
    mocks.premiums.mockRejectedValueOnce(new DataApiQueryError("before the window", 403, "INSUFFICIENT_TIER"));
    const early = await premiums.GET(request("/api/v1/market/premiums?game=one-piece&date=2020-01-01", "Bearer x"));
    expect(early.status).toBe(403);
    mocks.indices.mockRejectedValueOnce(new Error("DATABASE_URL=secret"));
    const failed = await indices.GET(request("/api/v1/market/indices?game=one-piece", "Bearer x"));
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("secret");
  });

  it("downloads a day's export as one complete NDJSON page", async () => {
    mocks.bearer.mockResolvedValue(accepted());
    const response = await exported.GET(request("/api/v1/market/export?date=2026-10-27", "Bearer x"));
    expect(response.status).toBe(200); privateResponse(response);
    expect(response.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="market-derived-2026-10-27.ndjson"');
    expect(response.headers.get("x-data-complete")).toBe("true");
    const lines = (await response.text()).trim().split("\n").map(line => JSON.parse(line));
    expect(lines.map(line => line.type)).toEqual(["manifest", "reference", "footer"]);
    expect(lines[0].rights).toContain("not licensed for AI training");
  });

  it("reports the plan, limits and month's count without prices", async () => {
    mocks.bearer.mockResolvedValue(accepted(entitlementFor(null)));
    const response = await usage.GET(request("/api/v1/account/usage", "Bearer x"));
    expect(response.status).toBe(200); privateResponse(response);
    const body = await response.json();
    expect(body.data).toMatchObject({
      plan: { id: "free", name: "Free" }, limits: { requestsPerMinutePerKey: 30, requestsPerMonthPerAccount: 100_000, historyDays: 365, maxActiveKeys: 5 },
      month: { start: "2026-10-01", used: 100, limit: 100_000 },
    });
    expect(body.data.metering).toContain("No paths, queries, IP addresses or read history");
    expect(JSON.stringify(body)).not.toMatch(/amountPence|"price"|proposed/);
  });
});

describe("plans catalogue posture", () => {
  it("is 404 NOT_PUBLISHED, without any price, unless published", async () => {
    for (const intake of [undefined, "test"]) {
      vi.unstubAllEnvs();
      if (intake) vi.stubEnv("DATA_API_CHECKOUT_INTAKE", intake);
      vi.stubEnv("DATA_API_PLANS_PUBLISHED", "yes");
      const response = await plans.GET();
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toContain("no-store");
      const text = await response.text();
      expect(JSON.parse(text)).toEqual({ error: "Data-API plans are not published.", code: "NOT_PUBLISHED" });
      expect(text).not.toMatch(/1200|6000|pence|Pro|Business/);
    }
  });

  it("when published, never says on sale while no member can buy, and says which closed state holds", async () => {
    vi.stubEnv("DATA_API_PLANS_PUBLISHED", "on");
    const closed = await (await plans.GET()).json();
    expect(closed.data).toMatchObject({ catalogue_version: "data-api-plans/2026-10-28.1", on_sale: false, sale_status: "closed" });
    expect(closed.data.plans.map((plan: { id: string; price: { amount_pence: number; proposed: boolean } }) => [plan.id, plan.price.amount_pence, plan.price.proposed]))
      .toEqual([["free", 0, true], ["pro", 1200, true], ["business", 6000, true]]);
    // Test-mode checkout admits operators only: still nothing on sale to members.
    vi.stubEnv("DATA_API_CHECKOUT_INTAKE", "test");
    expect((await (await plans.GET()).json()).data).toMatchObject({ on_sale: false, sale_status: "test-mode-operators-only" });
    // There is no live intake: an unknown value is closed.
    vi.stubEnv("DATA_API_CHECKOUT_INTAKE", "live");
    expect((await (await plans.GET()).json()).data).toMatchObject({ on_sale: false, sale_status: "closed" });
    expect(plans.POST().status).toBe(405);
  });
});
