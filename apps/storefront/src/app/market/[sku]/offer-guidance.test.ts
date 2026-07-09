import { describe, it, expect } from "vitest";
import {
  pickOfferAnchor,
  pctDelta,
  describeDelta,
  tradeLimitWarning,
} from "./offer-guidance";

// @/lib/db throws at import time without a connection string; postgres.js
// connects lazily, so a placeholder keeps these pure-logic tests runnable
// anywhere. Dynamic import because static imports would hoist above this.
process.env.DATABASE_URL ||= "postgres://localhost:5432/placeholder_never_connected";
const { acceptedOfferEconomics } = await import("@/lib/market/offers");

describe("pickOfferAnchor", () => {
  it("prefers own-tape VWAP over everything", () => {
    expect(pickOfferAnchor({ vwap: 18.5, median: 17, tradeCount: 4 }, 25))
      .toEqual({ kind: "own-tape", basis: "vwap", value: 18.5 });
  });

  it("falls back to own-tape median when VWAP is null", () => {
    expect(pickOfferAnchor({ vwap: null, median: 17, tradeCount: 4 }, 25))
      .toEqual({ kind: "own-tape", basis: "median", value: 17 });
  });

  it("uses CTCG spot only when the tape is cold", () => {
    expect(pickOfferAnchor({ vwap: null, median: null, tradeCount: 0 }, 25))
      .toEqual({ kind: "ctcg-spot", value: 25 });
    expect(pickOfferAnchor(null, 25)).toEqual({ kind: "ctcg-spot", value: 25 });
  });

  it("returns null when neither source exists", () => {
    expect(pickOfferAnchor(null, null)).toBeNull();
    expect(pickOfferAnchor({ vwap: null, median: null, tradeCount: 0 }, 0)).toBeNull();
  });
});

describe("pctDelta / describeDelta", () => {
  it("signs the delta (negative = below the anchor)", () => {
    expect(pctDelta(18, 20)).toBe(-10);
    expect(pctDelta(22, 20)).toBe(10);
    expect(pctDelta(20, 20)).toBe(0);
  });

  it("rounds to 0.1%", () => {
    expect(pctDelta(19.99, 20)).toBe(-0.1);
    expect(pctDelta(18.34, 20)).toBe(-8.3);
  });

  it("refuses a division by a non-positive anchor", () => {
    expect(pctDelta(18, 0)).toBeNull();
    expect(pctDelta(NaN, 20)).toBeNull();
  });

  it("phrases the delta honestly", () => {
    expect(describeDelta(-10)).toBe("10% below");
    expect(describeDelta(8.2)).toBe("8.2% above");
    expect(describeDelta(0)).toBe("at");
    expect(describeDelta(null)).toBeNull();
  });
});

describe("tradeLimitWarning", () => {
  const limits = { tradeLimit: 100, dailyLimit: 250 };

  it("stays silent under both limits", () => {
    expect(tradeLimitWarning(99.99, limits)).toBeNull();
  });

  it("names the per-trade limit first", () => {
    expect(tradeLimitWarning(150, limits)).toMatch(/per-trade limit of £100.00/);
  });

  it("names the daily limit when only that one binds", () => {
    expect(tradeLimitWarning(260, { tradeLimit: 500, dailyLimit: 250 }))
      .toMatch(/daily trading limit of £250.00/);
  });

  it("stays silent without limit data or a usable value", () => {
    expect(tradeLimitWarning(150, null)).toBeNull();
    expect(tradeLimitWarning(0, limits)).toBeNull();
  });
});

describe("acceptedOfferEconomics", () => {
  it("resolves the min(membership, trust) rate — trust path", () => {
    // Trust 80 → Veteran 6%; no tier.
    const e = acceptedOfferEconomics({
      agreedPrice: 100, quantity: 1, sellerTrustScore: 80, sellerTierRate: null,
    });
    expect(e.rate).toBe(0.06);
    expect(e.source).toBe("trust");
    expect(e.commission).toBe(6);
    expect(e.sellerPayout).toBe(94);
  });

  it("takes the membership rate when it is more favourable", () => {
    const e = acceptedOfferEconomics({
      agreedPrice: 100, quantity: 2, sellerTrustScore: 10, sellerTierRate: 0.05,
    });
    expect(e.value).toBe(200);
    expect(e.rate).toBe(0.05);
    expect(e.source).toBe("membership");
    expect(e.commission).toBe(10);
    expect(e.sellerPayout).toBe(190);
  });

  it("applies the per-item commission cap after the discount", () => {
    // £2,000 at the default 8% would be £160 — capped at £50.
    const e = acceptedOfferEconomics({
      agreedPrice: 2000, quantity: 1, sellerTrustScore: 0, sellerTierRate: null,
    });
    expect(e.rate).toBe(0.08);
    expect(e.commission).toBe(50);
    expect(e.sellerPayout).toBe(1950);
  });

  it("charges the default rate for unknown sellers", () => {
    const e = acceptedOfferEconomics({
      agreedPrice: 10, quantity: 1, sellerTrustScore: 0, sellerTierRate: null,
    });
    expect(e.rate).toBe(0.08);
    expect(e.source).toBe("default");
    expect(e.commission).toBe(0.8);
    expect(e.sellerPayout).toBe(9.2);
  });
});
