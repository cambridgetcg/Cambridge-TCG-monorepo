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
  it("uses the labelled catalogue reference", () => {
    expect(pickOfferAnchor(25))
      .toEqual({ kind: "catalogue-reference", value: 25 });
  });

  it("returns null without a usable catalogue reference", () => {
    expect(pickOfferAnchor(null)).toBeNull();
    expect(pickOfferAnchor(0)).toBeNull();
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
  it("keeps the trust source visible while charging no service fee", () => {
    const e = acceptedOfferEconomics({
      agreedPrice: 100, quantity: 1, sellerTrustScore: 80, sellerTierRate: null,
    });
    expect(e.rate).toBe(0);
    expect(e.source).toBe("trust");
    expect(e.commission).toBe(0);
    expect(e.sellerPayout).toBe(100);
  });

  it("keeps the full offer value when membership metadata cannot lower zero", () => {
    const e = acceptedOfferEconomics({
      agreedPrice: 100, quantity: 2, sellerTrustScore: 10, sellerTierRate: 0.05,
    });
    expect(e.value).toBe(200);
    expect(e.rate).toBe(0);
    expect(e.source).toBe("default");
    expect(e.commission).toBe(0);
    expect(e.sellerPayout).toBe(200);
  });

  it("does not invent a capped fee for a high-value offer", () => {
    const e = acceptedOfferEconomics({
      agreedPrice: 2000, quantity: 1, sellerTrustScore: 0, sellerTierRate: null,
    });
    expect(e.rate).toBe(0);
    expect(e.commission).toBe(0);
    expect(e.sellerPayout).toBe(2000);
  });

  it("charges no default fee for unknown sellers", () => {
    const e = acceptedOfferEconomics({
      agreedPrice: 10, quantity: 1, sellerTrustScore: 0, sellerTierRate: null,
    });
    expect(e.rate).toBe(0);
    expect(e.source).toBe("default");
    expect(e.commission).toBe(0);
    expect(e.sellerPayout).toBe(10);
  });
});
