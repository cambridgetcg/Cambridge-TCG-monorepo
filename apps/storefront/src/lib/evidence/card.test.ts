import { describe, expect, it } from "vitest";
import { buildCardEvidence, evidenceSourcesForGame } from "./card";

const sources = [
  {
    id: "cardrush",
    name: "CardRush",
    description: "",
    upstream: "https://example.test",
    catalog_section: "x",
    access: "scrape",
    license: "internal-only",
    redistribute: false,
    freshness: "price_current",
    canonical_effort: "high",
    status: "partial",
    games: ["op"],
    tos_notes: "",
  },
  {
    id: "tcgplayer",
    name: "TCGplayer",
    description: "",
    upstream: "https://example.test",
    catalog_section: "x",
    access: "blocked",
    license: "proprietary",
    redistribute: false,
    freshness: "price_current",
    canonical_effort: "medium",
    status: "blocked",
    games: ["op"],
    tos_notes: "",
  },
  {
    id: "cardmarket",
    name: "Cardmarket",
    description: "",
    upstream: "https://example.test",
    catalog_section: "x",
    access: "public-file",
    license: "proprietary",
    redistribute: false,
    freshness: "price_current",
    canonical_effort: "medium",
    status: "planned",
    games: ["op"],
    tos_notes: "",
  },
] as const;

describe("card evidence", () => {
  it("keeps reference, offers, and paused completed-sale publication as different claims", () => {
    const model = buildCardEvidence({
      sku: "op-op01-001-ja",
      game: "op",
      referenceAmountGbp: 12.34,
      referenceObservedAt: "2026-07-12T00:00:00Z",
      market: {
        sku: "op-op01-001-ja",
        card_name: null,
        card_number: null,
        set_code: null,
        set_name: null,
        image_url: null,
        rarity: null,
        reference_price: 12.34,
        bids: [{ price: "9.00", total_quantity: 1, order_count: 1 }],
        asks: [{ price: "13.00", total_quantity: 1, order_count: 1 }],
        trade_aggregates: [],
        trade_publication: {
          status: "paused",
          reason: "Publication receipts are missing.",
          resumeConditions: [],
        },
        best_bid: 9,
        best_ask: 13,
        market_price: 13,
        spread: 4,
        p2p_discount: null,
      },
      sources,
    });

    expect(model.reference).toMatchObject({ kind: "computed_reference", is_offer: false });
    expect(model.market).toMatchObject({ kind: "live_collector_offers", best_ask_gbp: 13 });
    expect(model.completed_sales).toMatchObject({
      state: "paused",
      rights: "NOASSERTION",
      source_rights: "internal-only",
      buckets: [],
    });
    expect(model.community_observations).toMatchObject({
      state: "paused",
      rights: "NOASSERTION",
      source_rights: "internal-only",
      buckets: [],
    });
    expect(model.aggregate_rights).toBe("NOASSERTION");
  });

  it("names restricted, blocked, and planned sources without unlocking them", () => {
    expect(evidenceSourcesForGame("op", sources)).toEqual([
      expect.objectContaining({ id: "cardrush", state: "observed_withheld", license: "internal-only" }),
      expect.objectContaining({ id: "tcgplayer", state: "blocked" }),
      expect.objectContaining({ id: "cardmarket", state: "planned" }),
    ]);
  });

  it("keeps both person-derived publication lanes paused when other reads fail", () => {
    const model = buildCardEvidence({
      sku: "op-op01-001-ja",
      game: "op",
      referenceAmountGbp: null,
      referenceObservedAt: null,
      market: null,
      sources: [],
    });

    expect(model.completed_sales.state).toBe("paused");
    expect(model.community_observations.state).toBe("paused");
  });
});
