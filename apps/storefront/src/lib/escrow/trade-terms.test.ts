import { describe, it, expect } from "vitest";
import { buildTradeTermBullets, tierHeadline, type StoredTradeTerms } from "./trade-terms";

// The walker trade that exposed the bug: full_escrow, ships to CTCG,
// 168h dispute window, 5-day hold, photos required, no returns. The
// recomputed routing endpoint mislabelled it "direct / 48h / 7-day".
const walkerTrade: StoredTradeTerms = {
  escrow_tier: "full_escrow",
  seller_ships_to: "ctcg",
  requires_photos: true,
  dispute_window_hours: 168,
  payout_hold_days: 5,
  accepts_returns: false,
  return_window_days: 14,
};

describe("buildTradeTermBullets — reads the stored snapshot, not the current tier", () => {
  it("uses the trade's OWN dispute window and payout hold (168h → 7-day, 5-day hold)", () => {
    const seller = buildTradeTermBullets(walkerTrade, "seller");
    expect(seller.some((b) => b.includes("7-day dispute window"))).toBe(true);
    expect(seller.some((b) => b.includes("released 5 days"))).toBe(true);
    // Must NOT leak the recomputed routing values.
    expect(seller.some((b) => b.includes("48h"))).toBe(false);
    expect(seller.some((b) => b.includes("7 days"))).toBe(false);
  });

  it("branches shipping copy on role — seller ships to CTCG, buyer is told CTCG forwards", () => {
    const seller = buildTradeTermBullets(walkerTrade, "seller");
    const buyer = buildTradeTermBullets(walkerTrade, "buyer");
    expect(seller[0]).toContain("Ship the card to Cambridge TCG");
    expect(buyer[0]).toContain("The seller ships to Cambridge TCG");
  });

  it("photo bullet appears only when requires_photos is set", () => {
    const withPhotos = buildTradeTermBullets(walkerTrade, "seller");
    expect(withPhotos.some((b) => b.toLowerCase().includes("photo"))).toBe(true);
    const noPhotos = buildTradeTermBullets({ ...walkerTrade, requires_photos: false }, "seller");
    expect(noPhotos.some((b) => b.toLowerCase().includes("photo"))).toBe(false);
  });

  it("direct-tier trade to buyer reads as a direct ship", () => {
    const direct: StoredTradeTerms = {
      escrow_tier: "direct",
      seller_ships_to: "buyer",
      requires_photos: false,
      dispute_window_hours: 48,
      payout_hold_days: 7,
      accepts_returns: true,
      return_window_days: 30,
    };
    const seller = buildTradeTermBullets(direct, "seller");
    expect(seller[0]).toContain("Ship directly to the buyer");
    // 48h divides evenly into days → the friendlier "2-day" label.
    expect(seller.some((b) => b.includes("2-day dispute window"))).toBe(true);
    expect(seller.some((b) => b.includes("Returns accepted within 30 days"))).toBe(true);
  });

  it("payout hold of 0 renders as an immediate release", () => {
    const instant = buildTradeTermBullets({ ...walkerTrade, payout_hold_days: 0 }, "seller");
    expect(instant.some((b) => b.includes("released as soon as"))).toBe(true);
  });
});

describe("tierHeadline", () => {
  it("full_escrow branches by role", () => {
    expect(tierHeadline(walkerTrade, "seller")).toContain("You ship to Cambridge TCG");
    expect(tierHeadline(walkerTrade, "buyer")).toContain("Ships through Cambridge TCG");
  });
  it("direct tier reads as a direct ship", () => {
    const direct: StoredTradeTerms = { escrow_tier: "direct", seller_ships_to: "buyer" };
    expect(tierHeadline(direct, "seller")).toContain("you ship directly to the buyer");
    expect(tierHeadline(direct, "buyer")).toContain("the seller ships directly to you");
  });
});
