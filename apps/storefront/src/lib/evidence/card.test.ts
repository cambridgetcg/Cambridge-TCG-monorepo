import { describe, expect, it, vi } from "vitest";
import { MEMBER_PRICE_POLICIES } from "@cambridge-tcg/data-ingest/member-prices";
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
    access: "scrape",
    license: "internal-only",
    redistribute: false,
    freshness: "page_collector",
    canonical_effort: "medium",
    status: "partial",
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
        bids: [{ price: "9.00", total_quantity: 3, order_count: 3 }],
        asks: [
          { price: "13.00", total_quantity: 2, order_count: 2 },
          { price: "14.00", total_quantity: 5, order_count: 4 },
        ],
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
    expect(model.market).toMatchObject({
      kind: "live_collector_offers",
      best_ask_gbp: 13,
      ask_count: 6,
      bid_count: 3,
    });
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

  it("names display-only and planned sources without unlocking them", () => {
    expect(evidenceSourcesForGame("op", sources)).toEqual([
      expect.objectContaining({ id: "cardrush", state: "display_only", license: "internal-only" }),
      expect.objectContaining({ id: "tcgplayer", state: "display_only", license: "internal-only" }),
      expect.objectContaining({ id: "cardmarket", state: "planned" }),
    ]);
  });

  // CardRush and TCGplayer have been display-only since 2026-10-28: on
  // Cambridge's pages with their names, never in an API. TCGplayer no longer
  // reads as blocked, and neither says anything is missing.
  it("says what a display-only source's values are for, and where they never go", () => {
    const [cardrush, tcgplayer] = evidenceSourcesForGame("op", sources);
    for (const source of [cardrush!, tcgplayer!]) {
      expect(source.reason).toContain("Display-only (written permission recorded 2026-10-28)");
      expect(source.reason).toContain("only while its collector is scheduled");
      expect(source.reason).toContain("never served by an API, a download or this response");
      expect(source.reason).not.toMatch(/No collection or display|not available|withheld:|observed/);
    }
  });

  // The state follows each source's release policy, not its name: a source
  // whose policy adds the member API is no longer display-only, and one whose
  // policy is display-only is, whatever it is called.
  it("reads display-only from the release policy", async () => {
    expect(MEMBER_PRICE_POLICIES.cardrush.uses).toEqual(["member-display"]);
    expect(MEMBER_PRICE_POLICIES.tcgplayer.uses).toEqual(["member-display"]);
    expect(MEMBER_PRICE_POLICIES.cardmarket.uses).toContain("member-api");
    const cardmarket = sources.map((source) => source.id === "cardmarket" ? { ...source, status: "partial" as const } : source);
    expect(evidenceSourcesForGame("op", cardmarket).map((source) => source.id)).toEqual(["cardrush", "tcgplayer"]);

    // A policy fixture with the roles swapped: Cardmarket display-only,
    // CardRush and TCGplayer exportable. A check on the source's name would
    // still call CardRush and TCGplayer display-only and Cardmarket planned.
    vi.resetModules();
    vi.doMock("@cambridge-tcg/data-ingest/member-prices", () => ({
      MEMBER_PRICE_POLICIES: {
        cardmarket: { uses: ["member-display"] },
        scryfall: { uses: ["member-display"] },
        cardrush: { uses: ["member-display", "member-api"] },
        tcgplayer: { uses: ["member-display", "member-download"] },
      },
    }));
    try {
      const swapped = await import("./card");
      expect(swapped.evidenceSourcesForGame("op", sources).map(({ id, state }) => ({ id, state }))).toEqual([
        { id: "cardmarket", state: "display_only" },
      ]);
    } finally {
      vi.doUnmock("@cambridge-tcg/data-ingest/member-prices");
      vi.resetModules();
    }
  });

  it("still names a blocked river as blocked", () => {
    const blocked = sources.map((source) => source.id === "cardmarket" ? { ...source, status: "blocked" as const } : source);
    expect(evidenceSourcesForGame("op", blocked)[2]).toMatchObject({
      id: "cardmarket",
      state: "blocked",
      reason: "No collection or display: the required permission or access is not available.",
    });
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
