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
  computeCommissionAmount,
  DEFAULTS,
  COMMISSION_RATE_BY_TRUST_TIER,
  DEFAULT_AUCTION_COMMISSION_RATE,
  DEFAULT_COMMISSION_CAP_GBP,
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

describe("computeCommissionAmount — the per-item commission cap (fairness fix)", () => {
  // Yu's mandate: minimum fees, never charge unfairly. The default cap is
  // £50 — at or below every incumbent cap (TCGplayer $75, Cardmarket €100).
  // If this constant moves, /methodology/fees and the wholesale seed
  // migration 0016_commission_cap.sql move in the same PR.
  it("default cap is £50 (at or below every incumbent)", () => {
    expect(DEFAULT_COMMISSION_CAP_GBP).toBe(50);
  });

  // ── The boundary: just under, at, and well over the cap ───────────────

  it("does NOT cap when the percentage fee is well under the cap", () => {
    // £100 sale @ 8% = £8 — nowhere near the £50 cap.
    const r = computeCommissionAmount(100, 0.08);
    expect(r.amount).toBe(8);
    expect(r.uncapped).toBe(8);
    expect(r.capped).toBe(false);
  });

  it("does NOT cap when the percentage fee lands JUST under the cap", () => {
    // £620 @ 8% = £49.60 — a penny under the cap, so the cap does not bind.
    const r = computeCommissionAmount(620, 0.08);
    expect(r.amount).toBeCloseTo(49.6, 2);
    expect(r.capped).toBe(false);
  });

  it("does NOT mark as capped when the percentage fee lands EXACTLY on the cap", () => {
    // £625 @ 8% = £50.00 exactly. The cap did not bind — fee equals cap by
    // coincidence of the percentage, not because we clamped it.
    const r = computeCommissionAmount(625, 0.08);
    expect(r.amount).toBe(50);
    expect(r.uncapped).toBe(50);
    expect(r.capped).toBe(false);
  });

  it("CAPS at £50 when the percentage fee would exceed it", () => {
    // £1,000 @ 8% = £80 uncapped → clamped to £50. This is the four-figure
    // card the fix exists for: without the cap we'd take MORE than eBay /
    // TCGplayer / Cardmarket; with it we take less.
    const r = computeCommissionAmount(1000, 0.08);
    expect(r.amount).toBe(50);
    expect(r.uncapped).toBe(80);
    expect(r.capped).toBe(true);
  });

  it("CAPS at £50 on a far-over-cap sale (£5,000 card)", () => {
    // £5,000 @ 8% = £400 uncapped → still just £50. The seller keeps £4,950.
    const r = computeCommissionAmount(5000, 0.08);
    expect(r.amount).toBe(50);
    expect(r.uncapped).toBe(400);
    expect(r.capped).toBe(true);
  });

  // ── The trust discount still applies BEFORE the cap ───────────────────

  it("applies the trust discount before the cap (Elite 5% on a £1,200 card)", () => {
    // Elite seller (trust ≥ 95) earns 5%. resolveCommission picks the rate;
    // computeCommissionAmount applies it, then caps.
    const { rate } = resolveCommission({ trustScore: 95, tierRate: null, kind: "p2p" });
    expect(rate).toBe(COMMISSION_RATE_BY_TRUST_TIER.Elite); // 0.05
    // £1,200 @ 5% = £60 uncapped → capped to £50.
    const r = computeCommissionAmount(1200, rate);
    expect(r.uncapped).toBe(60);
    expect(r.amount).toBe(50);
    expect(r.capped).toBe(true);
  });

  it("trust discount can keep a fee UNDER the cap where the base rate would not", () => {
    // £800 card. New seller @ 8% = £64 → capped to £50. Elite @ 5% = £40 →
    // NOT capped (the discount alone brought the fee under the cap). The
    // discount and the cap are independent fairness mechanisms.
    const newSeller = computeCommissionAmount(800, COMMISSION_RATE_BY_TRUST_TIER.New);
    expect(newSeller.amount).toBe(50);
    expect(newSeller.capped).toBe(true);

    const eliteSeller = computeCommissionAmount(800, COMMISSION_RATE_BY_TRUST_TIER.Elite);
    expect(eliteSeller.amount).toBe(40);
    expect(eliteSeller.capped).toBe(false);
  });

  // ── Auctions (fixed 12% rate) are capped too ──────────────────────────

  it("caps auction commission (12%) on a high-value lot", () => {
    // £600 auction @ 12% = £72 uncapped → capped to £50.
    const r = computeCommissionAmount(600, DEFAULT_AUCTION_COMMISSION_RATE);
    expect(r.uncapped).toBeCloseTo(72, 2);
    expect(r.amount).toBe(50);
    expect(r.capped).toBe(true);
  });

  // ── Runtime override (channel_pricing) ────────────────────────────────

  it("honours a runtime cap override (channel_pricing row value)", () => {
    // An operator could tighten the cap via the channel_pricing table.
    // £1,000 @ 8% = £80 → with a £25 override, clamped to £25.
    const r = computeCommissionAmount(1000, 0.08, 25);
    expect(r.amount).toBe(25);
    expect(r.capGbp).toBe(25);
    expect(r.capped).toBe(true);
  });

  it("treats a non-positive cap as 'no cap' (degrade to percentage-only)", () => {
    // A cap of 0 means uncapped — substrate-honest: an unset/disabled cap
    // must not silently zero the platform's commission.
    const r = computeCommissionAmount(1000, 0.08, 0);
    expect(r.amount).toBe(80);
    expect(r.capped).toBe(false);
  });
});
