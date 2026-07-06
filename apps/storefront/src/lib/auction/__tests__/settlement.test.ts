import { describe, it, expect } from "vitest";
import {
  isSelfBid,
  trustGateToBidResult,
  resolveAuctionPayout,
  isAuctionCondition,
  AUCTION_CONDITIONS,
} from "../types";

// These exercise the REAL predicates placeBid / acceptOffer /
// calculateSellerPayout use (types.ts imports no @/lib/db), so the guard
// and the settlement math can't drift from a test-only copy.

describe("isSelfBid — shill-bid guard (regular bid + best offer)", () => {
  it("rejects a bid from the auction's own seller", () => {
    expect(isSelfBid("user-seller", "user-seller")).toBe(true);
  });

  it("allows a bid from anyone else", () => {
    expect(isSelfBid("user-seller", "user-bidder")).toBe(false);
  });

  it("treats a house/CTCG auction (null seller) as never a self-bid", () => {
    // seller_user_id is null on CTCG-owned auctions — no user can 'be' the
    // seller, so the guard must not spuriously block real bidders.
    expect(isSelfBid(null, "user-bidder")).toBe(false);
    expect(isSelfBid(undefined, "user-bidder")).toBe(false);
  });
});

describe("trustGateToBidResult — best-offer + regular-bid trust gate shape", () => {
  it("returns null (no rejection) when the gate allows", () => {
    expect(trustGateToBidResult({ allowed: true })).toBeNull();
  });

  it("maps a denied gate to a BidResult carrying the gate's reason", () => {
    const r = trustGateToBidResult({
      allowed: false,
      reason: "This £900 exceeds your current per-trade limit of £500.",
    });
    expect(r).toEqual({
      success: false,
      error: "This £900 exceeds your current per-trade limit of £500.",
    });
  });

  it("falls back to a generic error when the gate gives no reason", () => {
    const r = trustGateToBidResult({ allowed: false });
    expect(r?.success).toBe(false);
    expect(r?.error).toBe("Order rejected by trust gate.");
  });
});

describe("resolveAuctionPayout — seller_payout on the FINAL winning price", () => {
  it("computes payout = price − commission at the default 12% rate", () => {
    // £100 hammer, 12% → £12 commission, £88 payout.
    const { rate, commission, payout } = resolveAuctionPayout({
      salePrice: 100,
      storedRate: 0.12,
      tierRate: null,
    });
    expect(rate).toBe(0.12);
    expect(commission).toBe(12);
    expect(payout).toBe(88);
  });

  it("applies the per-item commission cap (£50) on high hammer prices", () => {
    // £1,000 hammer at 12% is £120 uncapped — the fairness cap bounds the
    // fee at £50, so the seller keeps £950 (money math unchanged: 錢就再講).
    const { commission, payout } = resolveAuctionPayout({
      salePrice: 1000,
      storedRate: 0.12,
      tierRate: null,
    });
    expect(commission).toBe(50);
    expect(payout).toBe(950);
  });

  it("uses the FINAL price, not the starting price (the approve-path bug)", () => {
    // The admin approve path computed on the starting price (no bids yet).
    // At settlement the caller passes current_price = the final winning
    // bid, so a £250 win pays out on £250, never on a £5 start.
    const final = resolveAuctionPayout({ salePrice: 250, storedRate: 0.12, tierRate: null });
    const start = resolveAuctionPayout({ salePrice: 5, storedRate: 0.12, tierRate: null });
    expect(final.payout).toBe(220); // 250 − 30
    expect(final.payout).not.toBe(start.payout);
  });

  it("takes the tier rate as a floor — a tier upgrade lowers the rate", () => {
    // storedRate is the floor; a lower current-tier rate applies retroactively.
    const { rate, commission, payout } = resolveAuctionPayout({
      salePrice: 100,
      storedRate: 0.12,
      tierRate: 0.08,
    });
    expect(rate).toBe(0.08);
    expect(commission).toBe(8);
    expect(payout).toBe(92);
  });

  it("never RAISES the rate — a higher (downgraded) tier rate is ignored", () => {
    const { rate } = resolveAuctionPayout({
      salePrice: 100,
      storedRate: 0.10,
      tierRate: 0.15,
    });
    expect(rate).toBe(0.10);
  });
});

describe("isAuctionCondition — NM/LP/MP/HP/DMG set", () => {
  it("accepts every allowed condition", () => {
    for (const c of AUCTION_CONDITIONS) expect(isAuctionCondition(c)).toBe(true);
  });

  it("includes DMG (auctions allow damaged singles; the market order set does not)", () => {
    expect(isAuctionCondition("DMG")).toBe(true);
  });

  it("rejects unknown / missing conditions", () => {
    expect(isAuctionCondition("MINT")).toBe(false);
    expect(isAuctionCondition("")).toBe(false);
    expect(isAuctionCondition(undefined)).toBe(false);
    expect(isAuctionCondition(null)).toBe(false);
  });
});
