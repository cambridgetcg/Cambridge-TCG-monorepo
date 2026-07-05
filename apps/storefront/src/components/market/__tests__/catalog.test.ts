import { describe, it, expect } from "vitest";
import {
  buildBrowseUrl,
  buildCatalogSearch,
  derivePageStats,
  parseCatalogError,
  sortSetsForDisplay,
  type CatalogCard,
  type CatalogQuery,
} from "../catalog";

const base: CatalogQuery = {
  game: "one-piece",
  q: "",
  set: null,
  sort: "name_asc",
  page: 1,
  view: "table",
};

function card(over: Partial<CatalogCard>): CatalogCard {
  return {
    sku: "X",
    card_number: "X",
    name: "X",
    set_code: "OP01",
    set_name: "Romance Dawn",
    rarity: null,
    image_url: null,
    spot_price: 1,
    market_price: 1,
    stock: 0,
    best_bid: null,
    best_ask: null,
    p2p_sellers: 0,
    p2p_buyers: 0,
    has_p2p: false,
    tradein_credit: null,
    ...over,
  };
}

describe("buildBrowseUrl", () => {
  it("omits defaults entirely", () => {
    expect(buildBrowseUrl(base)).toBe("/market");
  });

  it("carries only the non-default parts", () => {
    expect(buildBrowseUrl({ ...base, q: "zoro", page: 3, view: "grid" })).toBe(
      "/market?q=zoro&page=3&view=grid",
    );
    expect(buildBrowseUrl({ ...base, game: "pokemon" })).toBe("/market?game=pokemon");
  });
});

describe("buildCatalogSearch", () => {
  it("converts 1-based page to offset and includes filters", () => {
    const s = new URLSearchParams(buildCatalogSearch({ ...base, page: 3, set: "OP05", q: "law" }));
    expect(s.get("offset")).toBe("96");
    expect(s.get("limit")).toBe("48");
    expect(s.get("set")).toBe("OP05");
    expect(s.get("q")).toBe("law");
    expect(s.get("game")).toBe("one-piece");
  });
});

describe("parseCatalogError", () => {
  it("reads the structured error body from the catalog route", () => {
    const body = {
      error: { code: "catalog_unavailable", message: "Source outage, not an empty catalog." },
      source: "unavailable",
    };
    expect(parseCatalogError(body)).toEqual({
      message: "Source outage, not an empty catalog.",
      code: "catalog_unavailable",
    });
  });

  it("reads legacy string errors", () => {
    expect(parseCatalogError({ error: "Boom" }).message).toBe("Boom");
  });

  it("falls back to an outage-shaped message, never an empty-catalog one", () => {
    expect(parseCatalogError(null).message).toMatch(/not an empty catalog/i);
    expect(parseCatalogError({}).message).toMatch(/not an empty catalog/i);
  });
});

describe("derivePageStats", () => {
  it("excludes the shop's standing credit bid from collector demand", () => {
    const stats = derivePageStats([
      // Shop credit bid only — p2p_buyers includes the +1 for CTCG.
      card({ p2p_buyers: 1, tradein_credit: 5 }),
      // One real collector bid on top of the shop's.
      card({ p2p_buyers: 3, tradein_credit: 5 }),
      // Asks only.
      card({ p2p_sellers: 2 }),
    ]);
    expect(stats.openBidUnits).toBe(2); // 0 + 2 + 0
    expect(stats.openAskUnits).toBe(2);
    expect(stats.cardsWithActivity).toBe(2); // shop-only card doesn't count
  });

  it("is zero-safe on an empty page", () => {
    expect(derivePageStats([])).toEqual({ cardsWithActivity: 0, openAskUnits: 0, openBidUnits: 0 });
  });
});

describe("sortSetsForDisplay", () => {
  it("orders main sets first, numeric-aware, promos last", () => {
    const sets = ["P-001", "ST10", "OP10", "EB01", "OP02", "ST02"].map((code) => ({
      code,
      name: code,
      card_count: 1,
      release_date: null,
    }));
    expect(sortSetsForDisplay(sets).map((s) => s.code)).toEqual([
      "OP02", "OP10", "EB01", "ST02", "ST10", "P-001",
    ]);
  });
});
