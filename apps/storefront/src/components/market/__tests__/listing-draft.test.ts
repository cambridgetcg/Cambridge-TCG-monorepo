import { describe, it, expect } from "vitest";
import {
  parseListingDraft,
  serializeListingDraft,
  priceGuidance,
  validateListing,
  draftCardFromCatalog,
  MAX_LISTING_QUANTITY,
  type ListingDraft,
} from "../listing-draft";
import type { CatalogCard } from "../catalog";

const card: CatalogCard = {
  sku: "OP01-001",
  card_number: "OP01-001",
  name: "Roronoa Zoro",
  set_code: "OP01",
  set_name: "Romance Dawn",
  rarity: "L",
  image_url: "https://img.example/zoro.jpg",
  spot_price: 12.5,
  market_price: 11.0,
  stock: 3,
  best_bid: 9.5,
  best_ask: 11.0,
  p2p_sellers: 2,
  p2p_buyers: 3,
  has_p2p: true,
  tradein_credit: 8.0,
};

function makeDraft(): ListingDraft {
  return {
    v: 1,
    game: "one-piece",
    card: draftCardFromCatalog(card, "wholesale-db"),
    condition: "NM",
    price: "10.50",
    quantity: "2",
    acceptsReturns: true,
    returnWindowDays: 14,
    savedAt: "2026-07-05T00:00:00.000Z",
  };
}

describe("listing draft round-trip", () => {
  it("survives serialize → parse unchanged", () => {
    const draft = makeDraft();
    expect(parseListingDraft(serializeListingDraft(draft))).toEqual(draft);
  });

  it("rejects null, garbage, and non-JSON", () => {
    expect(parseListingDraft(null)).toBeNull();
    expect(parseListingDraft("")).toBeNull();
    expect(parseListingDraft("not json {")).toBeNull();
    expect(parseListingDraft('"a string"')).toBeNull();
    expect(parseListingDraft("[1,2]")).toBeNull();
  });

  it("rejects wrong version and malformed shapes", () => {
    const draft = makeDraft();
    expect(parseListingDraft(JSON.stringify({ ...draft, v: 2 }))).toBeNull();
    expect(parseListingDraft(JSON.stringify({ ...draft, condition: "MINT" }))).toBeNull();
    expect(parseListingDraft(JSON.stringify({ ...draft, card: null }))).toBeNull();
    expect(parseListingDraft(JSON.stringify({ ...draft, card: { ...draft.card, sku: "" } }))).toBeNull();
    expect(parseListingDraft(JSON.stringify({ ...draft, price: 10.5 }))).toBeNull();
  });

  it("normalizes an unknown card source to 'unavailable'", () => {
    const draft = makeDraft();
    const tampered = JSON.parse(serializeListingDraft(draft));
    tampered.card.source = "definitely-not-a-source";
    expect(parseListingDraft(JSON.stringify(tampered))?.card.source).toBe("unavailable");
  });
});

describe("validateListing", () => {
  it("accepts a sane listing", () => {
    expect(validateListing("10.50", "2")).toEqual({});
  });

  it("rejects empty, zero, negative, and sub-penny prices", () => {
    expect(validateListing("", "1").price).toBeTruthy();
    expect(validateListing("0", "1").price).toBeTruthy();
    expect(validateListing("-3", "1").price).toBeTruthy();
    expect(validateListing("1.999", "1").price).toBeTruthy();
    expect(validateListing("abc", "1").price).toBeTruthy();
  });

  it("rejects non-integer, zero, and oversized quantities", () => {
    expect(validateListing("5", "0").quantity).toBeTruthy();
    expect(validateListing("5", "1.5").quantity).toBeTruthy();
    expect(validateListing("5", "").quantity).toBeTruthy();
    expect(validateListing("5", String(MAX_LISTING_QUANTITY + 1)).quantity).toBeTruthy();
    expect(validateListing("5", String(MAX_LISTING_QUANTITY)).quantity).toBeUndefined();
  });
});

describe("priceGuidance", () => {
  const ref = { best_ask: 11.0, best_bid: 9.5, spot_price: 12.5 };

  it("returns nothing for unpriced input", () => {
    expect(priceGuidance(NaN, ref)).toEqual([]);
    expect(priceGuidance(0, ref)).toEqual([]);
    expect(priceGuidance(-1, ref)).toEqual([]);
  });

  it("flags a price that meets the best bid (may fill instantly)", () => {
    const kinds = priceGuidance(9.0, ref).map((h) => h.kind);
    expect(kinds).toContain("meets_bid");
    expect(kinds).toContain("undercuts_best_ask");
  });

  it("meets_bid fires at exactly the bid", () => {
    expect(priceGuidance(9.5, ref).map((h) => h.kind)).toContain("meets_bid");
  });

  it("flags undercutting vs sitting above the best ask", () => {
    expect(priceGuidance(10.5, ref).map((h) => h.kind)).toContain("undercuts_best_ask");
    expect(priceGuidance(11.0, ref).map((h) => h.kind)).toContain("at_or_above_best_ask");
    expect(priceGuidance(15.0, ref).map((h) => h.kind)).toContain("at_or_above_best_ask");
  });

  it("names the first ask when the book is empty on the ask side", () => {
    const kinds = priceGuidance(10, { best_ask: null, best_bid: null, spot_price: 12.5 }).map((h) => h.kind);
    expect(kinds).toContain("first_ask");
    expect(kinds).not.toContain("meets_bid");
  });

  it("flags pricing above spot, and skips when spot is unknown (0)", () => {
    expect(priceGuidance(13, ref).map((h) => h.kind)).toContain("above_spot");
    expect(priceGuidance(12.5, ref).map((h) => h.kind)).not.toContain("above_spot");
    expect(priceGuidance(13, { ...ref, spot_price: 0 }).map((h) => h.kind)).not.toContain("above_spot");
  });
});
