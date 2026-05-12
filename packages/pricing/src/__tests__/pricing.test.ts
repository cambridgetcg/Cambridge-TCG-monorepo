/**
 * Tests for @cambridge-tcg/pricing pure-compute surface.
 *
 * Locks the contract Phase 1 of kingdom-049 established:
 *  - `computePrice(jpy, rate, config, category)` produces the same numbers
 *    the platform's old wholesale-local pricing.ts produced before the
 *    extraction.
 *  - `computePriceForChannel(...)` looks up the channel from DEFAULTS and
 *    honours optional row overrides.
 *  - `resolveCommission(...)` produces the `min(tier, trust)` combine and
 *    surfaces the source the rate came from.
 *  - `commissionRateForScore(...)` matches the platform's tier thresholds.
 *
 * The worked example in `docs/methodology/pricing.md` is locked here as
 * the canonical regression test: ¥600 @ 185 GBP/JPY produces £5.20 on
 * cambridgetcg, £5.70 on eBay, £1.78 on trade-in cash. If any of those
 * numbers ever change, this test fires and the methodology page must be
 * updated in the same PR.
 */

import { describe, it, expect } from "vitest";
import {
  computePrice,
  computePriceForChannel,
  resolveCommission,
  commissionRateForScore,
  DEFAULTS,
  COMMISSION_RATE_BY_TRUST_TIER,
  DEFAULT_AUCTION_COMMISSION_RATE,
  type ChannelConfig,
} from "../index";

describe("computePrice", () => {
  it("computes the wholesale base correctly", () => {
    const config: ChannelConfig = DEFAULTS.wholesale!;
    const result = computePrice(600, 185, config, "singles");
    expect(result.channel).toBe("wholesale");
    expect(result.baseGbp).toBeCloseTo(3.24, 2);
  });

  it("honours the singles flat fee for singles category", () => {
    const result = computePrice(1000, 185, DEFAULTS.cambridgetcg!, "singles");
    // (1000/185 * 1.08 + 0.22) * 1.15 * 1.20 → Math.round to 0.10
    // = (5.405 * 1.08 + 0.22) * 1.15 * 1.20
    // = 8.36
    // Math.round to 0.10 = 8.40
    expect(result.price).toBeCloseTo(8.40, 2);
  });

  it("uses the sealed flat fee for sealed category", () => {
    const result = computePrice(1000, 185, DEFAULTS.cambridgetcg!, "sealed");
    // Sealed flat fee is 2.20, not 0.22
    expect(result.price).toBeGreaterThan(
      computePrice(1000, 185, DEFAULTS.cambridgetcg!, "singles").price,
    );
  });

  it("rounds up to the channel's roundTo step", () => {
    // cambridgetcg has roundTo = 0.10
    const result = computePrice(50, 185, DEFAULTS.cambridgetcg!, "singles");
    // Final price must be a multiple of 0.10
    const cents = Math.round(result.price * 100);
    expect(cents % 10).toBe(0);
  });
});

describe("computePriceForChannel — methodology worked example", () => {
  // Locks the worked example from docs/methodology/pricing.md.
  // ¥600 @ 185 GBP/JPY. Rounding is Math.round (banker's-style), not ceil.

  it("cambridgetcg → £5.10", () => {
    const result = computePriceForChannel(600, 185, "cambridgetcg", "singles");
    expect(result.price).toBe(5.10);
  });

  it("shopify → £5.10 (same multipliers as cambridgetcg)", () => {
    const result = computePriceForChannel(600, 185, "shopify", "singles");
    expect(result.price).toBe(5.10);
  });

  it("ebay → £5.60 (higher retail multiplier)", () => {
    const result = computePriceForChannel(600, 185, "ebay", "singles");
    expect(result.price).toBe(5.60);
  });

  it("tradein-cash → £1.78 (margin 0.55, no flat fee, no VAT)", () => {
    const result = computePriceForChannel(600, 185, "tradein-cash", "singles");
    // 3.243 * 0.55 = 1.78
    expect(result.price).toBeCloseTo(1.78, 2);
  });

  it("tradein-credit → £2.50 (margin 0.77)", () => {
    const result = computePriceForChannel(600, 185, "tradein-credit", "singles");
    // 3.243 * 0.77 ≈ 2.50
    expect(result.price).toBeCloseTo(2.50, 2);
  });

  it("honours optionalRow overrides", () => {
    const baseline = computePriceForChannel(600, 185, "cambridgetcg", "singles");
    const overridden = computePriceForChannel(600, 185, "cambridgetcg", "singles", {
      retailMultiplier: 2.00, // double the retail multiplier
    });
    expect(overridden.price).toBeGreaterThan(baseline.price);
  });

  it("unknown channel falls back to wholesale (legacy back-compat)", () => {
    const result = computePriceForChannel(600, 185, "no-such-channel", "singles");
    const wholesale = computePriceForChannel(600, 185, "wholesale", "singles");
    expect(result.price).toBe(wholesale.price);
  });
});

describe("commissionRateForScore", () => {
  it("returns Elite rate for trust ≥ 95", () => {
    expect(commissionRateForScore(95)).toBe(COMMISSION_RATE_BY_TRUST_TIER.Elite);
    expect(commissionRateForScore(100)).toBe(COMMISSION_RATE_BY_TRUST_TIER.Elite);
  });

  it("returns Veteran rate for trust 80-94", () => {
    expect(commissionRateForScore(80)).toBe(COMMISSION_RATE_BY_TRUST_TIER.Veteran);
    expect(commissionRateForScore(94)).toBe(COMMISSION_RATE_BY_TRUST_TIER.Veteran);
  });

  it("returns Trusted rate for trust 50-79", () => {
    expect(commissionRateForScore(50)).toBe(COMMISSION_RATE_BY_TRUST_TIER.Trusted);
    expect(commissionRateForScore(79)).toBe(COMMISSION_RATE_BY_TRUST_TIER.Trusted);
  });

  it("returns Starter rate for trust 20-49", () => {
    expect(commissionRateForScore(20)).toBe(COMMISSION_RATE_BY_TRUST_TIER.Starter);
    expect(commissionRateForScore(49)).toBe(COMMISSION_RATE_BY_TRUST_TIER.Starter);
  });

  it("returns New rate for trust < 20", () => {
    expect(commissionRateForScore(0)).toBe(COMMISSION_RATE_BY_TRUST_TIER.New);
    expect(commissionRateForScore(19)).toBe(COMMISSION_RATE_BY_TRUST_TIER.New);
  });
});

describe("resolveCommission", () => {
  it("picks the membership rate when it beats trust", () => {
    const r = resolveCommission({
      trustScore: 30, // Starter → 0.08
      tierRate: 0.05, // Better
      kind: "p2p",
    });
    expect(r.rate).toBe(0.05);
    expect(r.source).toBe("membership");
    expect(r.trustRate).toBe(0.08);
    expect(r.membershipRate).toBe(0.05);
  });

  it("picks the trust rate when it beats membership", () => {
    const r = resolveCommission({
      trustScore: 95, // Elite → 0.05
      tierRate: 0.07, // Worse
      kind: "p2p",
    });
    expect(r.rate).toBe(COMMISSION_RATE_BY_TRUST_TIER.Elite);
    expect(r.source).toBe("trust");
  });

  it("uses trust when no tierRate", () => {
    const r = resolveCommission({
      trustScore: 80,
      tierRate: null,
      kind: "p2p",
    });
    expect(r.rate).toBe(COMMISSION_RATE_BY_TRUST_TIER.Veteran);
    expect(r.source).toBe("trust");
    expect(r.membershipRate).toBeNull();
  });

  it("marks source as 'default' when trust is below 50 and no tier", () => {
    const r = resolveCommission({
      trustScore: 10,
      tierRate: null,
      kind: "p2p",
    });
    expect(r.source).toBe("default");
  });

  it("auction kind returns the fixed default rate (no trust curve)", () => {
    const r = resolveCommission({
      trustScore: 95,
      tierRate: null,
      kind: "auction",
    });
    expect(r.rate).toBe(DEFAULT_AUCTION_COMMISSION_RATE);
    expect(r.trustRate).toBe(DEFAULT_AUCTION_COMMISSION_RATE);
  });

  it("auction membership beats default if lower", () => {
    const r = resolveCommission({
      trustScore: 50,
      tierRate: 0.08, // Lower than 0.12 default
      kind: "auction",
    });
    expect(r.rate).toBe(0.08);
    expect(r.source).toBe("membership");
  });
});

describe("DEFAULTS — channel coverage", () => {
  // Every channel named in the methodology table must be present in
  // DEFAULTS so the seed migration matches the package.
  const REQUIRED = [
    "wholesale", "shopify", "cambridgetcg",
    "ebay", "cardmarket",
    "tradein-cash", "tradein-credit",
  ];

  it.each(REQUIRED)("has %s channel", (channel) => {
    expect(DEFAULTS[channel]).toBeDefined();
    expect(DEFAULTS[channel]!.channel).toBe(channel);
  });

  it("wholesale has retailMultiplier = 1.00 (no retail uplift)", () => {
    expect(DEFAULTS.wholesale!.retailMultiplier).toBe(1.00);
  });

  it("trade-in channels have margin < 1 (we pay, not charge)", () => {
    expect(DEFAULTS["tradein-cash"]!.marginMultiplier).toBeLessThan(1);
    expect(DEFAULTS["tradein-credit"]!.marginMultiplier).toBeLessThan(1);
  });

  it("trade-in channels have vatMultiplier = 1.00 (no VAT)", () => {
    expect(DEFAULTS["tradein-cash"]!.vatMultiplier).toBe(1);
    expect(DEFAULTS["tradein-credit"]!.vatMultiplier).toBe(1);
  });
});
