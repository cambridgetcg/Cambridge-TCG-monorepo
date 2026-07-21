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

describe("resolveAuctionPayout — Cambridge TCG is free (no seller commission)", () => {
  it("takes no commission — the seller keeps the full hammer price", () => {
    const { rate, commission, payout } = resolveAuctionPayout({
      salePrice: 100,
      storedRate: 0.12,
      tierRate: null,
    });
    expect(rate).toBe(0);
    expect(commission).toBe(0);
    expect(payout).toBe(100);
  });

  it("keeps the full price on high hammers too — no fee, no cap needed", () => {
    const { commission, payout } = resolveAuctionPayout({
      salePrice: 1000,
      storedRate: 0.12,
      tierRate: null,
    });
    expect(commission).toBe(0);
    expect(payout).toBe(1000);
  });

  it("pays out on the FINAL winning price, in full", () => {
    const final = resolveAuctionPayout({ salePrice: 250, storedRate: 0.12, tierRate: null });
    expect(final.payout).toBe(250);
  });

  it("ignores any stored or tier rate — the market is free for everyone", () => {
    for (const tierRate of [null, 0.08, 0.15] as const) {
      const { rate, commission, payout } = resolveAuctionPayout({ salePrice: 100, storedRate: 0.12, tierRate });
      expect(rate).toBe(0);
      expect(commission).toBe(0);
      expect(payout).toBe(100);
    }
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
