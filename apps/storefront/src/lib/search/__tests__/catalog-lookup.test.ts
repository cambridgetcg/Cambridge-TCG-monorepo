import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fetchGames, fetchPrices, type PriceItem } from "@/lib/wholesale/client";
import { fetchSearchCandidates } from "../catalog-lookup";
import { GET as searchCards } from "@/app/api/v1/search/cards/route";
import { GET as searchEverything } from "@/app/api/v1/search/everything/route";

vi.mock("@/lib/wholesale/client", () => ({ fetchGames: vi.fn(), fetchPrices: vi.fn() }));
const { compose } = vi.hoisted(() => ({ compose: vi.fn() }));
vi.mock("@/app/api/v1/cards/[sku]/everything/route", () => ({ GET: compose }));
const games = vi.mocked(fetchGames);
const prices = vi.mocked(fetchPrices);
const outbound = vi.fn();
const card = (sku = "OP-OP01-001-JP-V1"): PriceItem => ({
  sku, card_number: "OP01-001", set_code: "OP01", name: "Example", name_en: null,
  price_gbp: null, stock: 0, pending_stock: 0, image_url: null, set_name: null,
  rarity: null, category: null, updated_at: null,
});
const body = (items: PriceItem[] = [], source: "wholesale-db" | "unavailable" = "wholesale-db") => ({
  items, count: items.length, total: items.length, channel: "", source,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", outbound);
  games.mockResolvedValue([
    { code: "onepiece", slug: "one-piece", name: "One Piece TCG", image_url: null, card_count: 1 },
    { code: "pokemon", slug: "pokemon", name: "Pokémon TCG", image_url: null, card_count: 1 },
  ]);
  prices.mockResolvedValue(body([card()]));
  compose.mockResolvedValue(Response.json({ data: { example: true } }));
});

describe("game-scoped candidate retrieval", () => {
  it("translates the requested game's registry alias without set-based overrides", async () => {
    await fetchSearchCandidates({ game: "op", q: "OP01-001", limit: 20 });
    expect(prices).toHaveBeenCalledWith({ game: "onepiece", q: "OP01-001", limit: 20 });
  });
  it("filters wrong-game provider rows and never queries that game's alias", async () => {
    prices.mockResolvedValue(body([card("pkm-op01-001-ja")]));
    expect((await fetchSearchCandidates({ game: "op", q: "OP01-001", limit: 20 })).items).toEqual([]);
    expect(prices.mock.calls.every(([args]) => ["onepiece", "one-piece", "op"].includes(args!.game!))).toBe(true);
  });
  it("does not trust a conflicting game code in catalog registry metadata", async () => {
    games.mockResolvedValue([{ code: "pokemon", slug: "one-piece", name: "One Piece TCG", image_url: null, card_count: 1 }]);
    await fetchSearchCandidates({ game: "op", q: "OP01-001", limit: 20 });
    expect(prices.mock.calls.some(([args]) => args?.game === "pokemon")).toBe(false);
  });
  it("preserves unavailable separately from a successful empty result", async () => {
    prices.mockResolvedValue(body([], "unavailable"));
    expect((await fetchSearchCandidates({ game: "op", q: "OP01-001", limit: 20 })).source).toBe("unavailable");
    prices.mockResolvedValue(body());
    expect((await fetchSearchCandidates({ game: "op", q: "OP01-001", limit: 20 })).source).toBe("wholesale-db");
  });
});

describe.each([["cards", searchCards], ["everything", searchEverything]] as const)("search/%s contract", (route, get) => {
  const request = (query: string) => new NextRequest(`https://cambridgetcg.example/api/v1/search/${route}?${query}`);
  it("rejects unknown or contradictory games before any source request", async () => {
    for (const query of ["game=unknown&q=OP01-001", "game=pokemon&q=op-op01-001-ja", "game=tst&q=001"]) {
      const response = await get(request(query));
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_INPUT");
    }
    expect(games).not.toHaveBeenCalled();
    expect(prices).not.toHaveBeenCalled();
  });
  it("normalizes the matching candidate without rewriting the stored SKU", async () => {
    const response = await get(request("game=op&q=op-op01-001-ja-v1"));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.data.matches[0]).toMatchObject({
      sku: "OP-OP01-001-JP-V1", lang: "ja", confidence: "exact",
      identity: { canonical_sku: "op-op01-001-ja-v1", scope: "syntax_only" },
    });
  });
  it("reports source failure as 503, while successful absence stays empty", async () => {
    prices.mockResolvedValue(body([], "unavailable"));
    const unavailable = await get(request("game=op&q=001"));
    expect(unavailable.status).toBe(503);
    expect((await unavailable.json()).error.code).toBe("SOURCE_UNAVAILABLE");
    prices.mockResolvedValue(body());
    const empty = await get(request("game=op&q=001"));
    expect(empty.status).toBe(200);
    expect((await empty.json()).data.matches).toEqual([]);
  });
});

describe("composition requires a printing choice", () => {
  const request = (extra = "") => new NextRequest(`https://cambridgetcg.example/api/v1/search/everything?game=op&q=OP01-001${extra}`);
  it("does not select the first of several exact variants", async () => {
    prices.mockResolvedValue(body([card(), card("OP-OP01-001-JP-V2")]));
    const data = (await (await searchEverything(request())).json()).data;
    expect(data.matches).toHaveLength(2);
    expect(data.folded_sku).toBeNull();
    expect(compose).not.toHaveBeenCalled();
  });
  it("does not substitute another language when the requested one is missing", async () => {
    const data = (await (await searchEverything(request("&lang=en"))).json()).data;
    expect(data.folded_sku).toBeNull();
    expect(compose).not.toHaveBeenCalled();
  });
  it("does not claim a unique printing from a truncated candidate page", async () => {
    prices.mockResolvedValue({ ...body([card()]), total: 100 });
    const data = (await (await searchEverything(request())).json()).data;
    expect(data.lookup).toEqual({ limit: 50, truncated: true });
    expect(data.folded_sku).toBeNull();
    expect(compose).not.toHaveBeenCalled();
  });
  it("accepts the legacy language alias and folds a single candidate using its raw key", async () => {
    const data = (await (await searchEverything(request("&lang=jp"))).json()).data;
    expect(data.folded_sku).toBe("OP-OP01-001-JP-V1");
    expect(compose.mock.calls[0]?.[0].url).toContain("/cards/OP-OP01-001-JP-V1/everything");
    expect(outbound).not.toHaveBeenCalled();
  });
  it("ignores malicious forwarding headers and delegates without outbound HTTP or caller credentials", async () => {
    const request = new NextRequest("https://cambridgetcg.example/api/v1/search/everything?game=op&q=OP01-001", {
      headers: { host: "127.0.0.1:1", "x-forwarded-host": "169.254.169.254", "x-forwarded-proto": "http", authorization: "test-only-header" },
    });
    const data = (await (await searchEverything(request)).json()).data;
    expect(data.composition.composer_call).toBe("ok");
    const delegated = compose.mock.calls[0]?.[0] as NextRequest;
    expect(new URL(delegated.url).origin).toBe("https://cambridgetcg.com");
    expect(delegated.headers.has("authorization")).toBe(false);
    expect(delegated.headers.has("x-forwarded-host")).toBe(false);
    expect(outbound).not.toHaveBeenCalled();
  });
});
