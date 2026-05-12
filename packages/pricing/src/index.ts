/**
 * @module @cambridge-tcg/pricing
 *
 * Pure pricing computation for Cambridge TCG. ORM-agnostic, no runtime
 * dependencies; safe to import from any app or shared package.
 *
 * One source of truth for the channel-aware pricing math the platform
 * does. Phase 1 of the pricing-backend consolidation
 * (see docs/pricing-current-state.md).
 *
 * Usage:
 *
 *   // Wholesale-side: full chain from CardRush JPY to retail GBP
 *   import { computePriceForChannel } from "@cambridge-tcg/pricing";
 *   const breakdown = computePriceForChannel(jpy, rate, "shopify", "singles");
 *
 *   // Storefront/admin-side: read a channel's configured constants
 *   import { DEFAULTS } from "@cambridge-tcg/pricing";
 *   const tradeinCreditMult = DEFAULTS["tradein-credit"].marginMultiplier;
 *
 * The DB-backed `channel_pricing` table can override `DEFAULTS` at
 * runtime; that's wholesale-side (apps/wholesale/src/lib/channel-pricing.ts)
 * and Phase 3 will make the DB authoritative (no silent JS fallback).
 * Until Phase 3 lands, DEFAULTS is read directly by callers that don't
 * have a DB connection (storefront, admin formulas).
 */

// ── Types ────────────────────────────────────────────────────────────────

export interface ChannelConfig {
  channel: string;
  /** Multiplier applied to the wholesale base. 1.08 ≈ 8% margin. */
  marginMultiplier: number;
  /** Per-card flat fee for `singles`. */
  flatFeeSingles: number;
  /** Per-product flat fee for `sealed`. */
  flatFeeSealed: number;
  /** VAT multiplier; 1.20 ≈ 20% UK VAT. */
  vatMultiplier: number;
  /** Channel-specific retail uplift (eBay 1.25, Shopify 1.15, ...). */
  retailMultiplier: number;
  /** Final round step (£0.01 / £0.10 / etc). */
  roundTo: number;
}

export interface PriceBreakdown {
  baseGbp: number;
  exVat: number;
  vat: number;
  preRound: number;
  price: number;
  channel: string;
}

// ── Default configs for all known channels ──────────────────────────────
//
// `DEFAULTS` is the platform's seed truth for channel pricing constants.
// In production the wholesale `channel_pricing` table may override these
// per-row; this constant is the fallback used when:
//   (a) callers don't have a DB connection (storefront retail markup),
//   (b) the DB row is missing entirely (Phase 3 makes this throw rather
//       than silently fall back — see docs/pricing-current-state.md §4.2).

export const DEFAULTS: Record<string, ChannelConfig> = {
  wholesale: {
    channel: "wholesale",
    marginMultiplier: 1.08,
    flatFeeSingles: 0.22,
    flatFeeSealed: 2.20,
    vatMultiplier: 1.20,
    retailMultiplier: 1.00,
    roundTo: 0.01,
  },
  shopify: {
    channel: "shopify",
    marginMultiplier: 1.08,
    flatFeeSingles: 0.22,
    flatFeeSealed: 2.20,
    vatMultiplier: 1.20,
    retailMultiplier: 1.15,
    roundTo: 0.10,
  },
  cambridgetcg: {
    channel: "cambridgetcg",
    marginMultiplier: 1.08,
    flatFeeSingles: 0.22,
    flatFeeSealed: 2.20,
    vatMultiplier: 1.20,
    retailMultiplier: 1.15,
    roundTo: 0.10,
  },
  "tradein-cash": {
    channel: "tradein-cash",
    marginMultiplier: 0.55,
    flatFeeSingles: 0,
    flatFeeSealed: 0,
    vatMultiplier: 1.0,
    retailMultiplier: 1.0,
    roundTo: 0.01,
  },
  "tradein-credit": {
    channel: "tradein-credit",
    marginMultiplier: 0.77,
    flatFeeSingles: 0,
    flatFeeSealed: 0,
    vatMultiplier: 1.0,
    retailMultiplier: 1.0,
    roundTo: 0.01,
  },
  ebay: {
    channel: "ebay",
    marginMultiplier: 1.08,
    flatFeeSingles: 0.22,
    flatFeeSealed: 2.20,
    vatMultiplier: 1.20,
    retailMultiplier: 1.25,
    roundTo: 0.10,
  },
  cardmarket: {
    channel: "cardmarket",
    marginMultiplier: 1.08,
    flatFeeSingles: 0.22,
    flatFeeSealed: 2.20,
    vatMultiplier: 1.20,
    retailMultiplier: 1.20,
    roundTo: 0.01,
  },
};

// ── Core computation ─────────────────────────────────────────────────────

function roundToStep(n: number, step: number): number {
  if (step <= 0) return round2(n);
  return Math.round(n / step) * step;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computePrice(
  cardrushJpy: number,
  gbpJpyRate: number,
  config: ChannelConfig,
  category: string | null,
): PriceBreakdown {
  const baseGbp = cardrushJpy / gbpJpyRate;
  const flatFee = category === "sealed" ? config.flatFeeSealed : config.flatFeeSingles;
  const exVat = (baseGbp * config.marginMultiplier + flatFee) * config.retailMultiplier;
  const vat = exVat * (config.vatMultiplier - 1);
  const preRound = exVat + vat;
  const price = roundToStep(preRound, config.roundTo);

  return {
    baseGbp: round2(baseGbp),
    exVat: round2(exVat),
    vat: round2(vat),
    preRound: round2(preRound),
    price: round2(price),
    channel: config.channel,
  };
}

export function computePriceForChannel(
  cardrushJpy: number,
  gbpJpyRate: number,
  channel: string,
  category: string | null,
  optionalRow?: Partial<ChannelConfig>,
): PriceBreakdown {
  const defaults = DEFAULTS[channel] ?? DEFAULTS.wholesale;
  const config: ChannelConfig = optionalRow
    ? { ...defaults, ...optionalRow, channel }
    : defaults;
  return computePrice(cardrushJpy, gbpJpyRate, config, category);
}

// ── Backwards-compatible exports ─────────────────────────────────────────
//
// Pre-Phase-1 imports of `apps/wholesale/src/lib/pricing.ts` exposed
// these constants and helpers directly. They are kept here so the
// wholesale shim re-exports the entire surface unchanged.

export const MARGIN_PCT = 0.08;
export const PER_CARD_FEE = 0.22;
export const SEALED_MARGIN_PCT = 0.08;
export const SEALED_FLAT_FEE = 2.20;
export const VAT_MULTIPLIER = 1.20;

export function calculatePrice(cardrushJpy: number, gbpJpyRate: number): PriceBreakdown {
  return computePriceForChannel(cardrushJpy, gbpJpyRate, "wholesale", "singles");
}

export function calculateSealedPrice(cardrushJpy: number, gbpJpyRate: number): PriceBreakdown {
  return computePriceForChannel(cardrushJpy, gbpJpyRate, "wholesale", "sealed");
}

export function calculatePriceByCategory(
  cardrushJpy: number,
  gbpJpyRate: number,
  category: string | null,
): PriceBreakdown {
  return computePriceForChannel(cardrushJpy, gbpJpyRate, "wholesale", category);
}

// ── Commission resolution ────────────────────────────────────────────────
//
// Phase 6 of kingdom-049. Pure-compute counterpart to the storefront's
// resolveCommissionRate (in apps/storefront/src/lib/membership/commission.ts).
// The storefront's variant does its own DB lookup; this one accepts
// pre-fetched values so callers inside a transaction can use their own
// query client. Both produce the same shape, ensuring the rate a trade
// is charged matches what /catalog/users/[id] would show.
//
// The combine rule: `min(tierRate, trustRate)` — neither path cancels the
// other. Every reputational success (trust ≥ 50) and every paid-tier
// dollar (tier_id set with a lower rate) earns the discount. Sellers
// with neither pay the default.

/** Per-trust-tier commission rate (P2P only). Mirrors COMMISSION_RATE_BY_TIER. */
export const COMMISSION_RATE_BY_TRUST_TIER = {
  New:     0.08,
  Starter: 0.08,
  Trusted: 0.07,
  Veteran: 0.06,
  Elite:   0.05,
} as const;

export const DEFAULT_P2P_COMMISSION_RATE = COMMISSION_RATE_BY_TRUST_TIER.New;
export const DEFAULT_AUCTION_COMMISSION_RATE = 0.12;

/** Resolve trust score → P2P commission rate. Lifts the curve from
 *  apps/storefront/src/lib/market/types.ts so the package owns the
 *  canonical formula. */
export function commissionRateForScore(trustScore: number): number {
  if (trustScore >= 95) return COMMISSION_RATE_BY_TRUST_TIER.Elite;
  if (trustScore >= 80) return COMMISSION_RATE_BY_TRUST_TIER.Veteran;
  if (trustScore >= 50) return COMMISSION_RATE_BY_TRUST_TIER.Trusted;
  if (trustScore >= 20) return COMMISSION_RATE_BY_TRUST_TIER.Starter;
  return COMMISSION_RATE_BY_TRUST_TIER.New;
}

export interface CommissionInputs {
  trustScore: number;
  /** Tier's configured rate (null when no tier or no row). */
  tierRate: number | null;
  kind: "p2p" | "auction";
}

export interface ResolvedCommission {
  rate: number;
  source: "membership" | "trust" | "default";
  trustRate: number;
  membershipRate: number | null;
}

/**
 * Pure-compute commission resolver. Accepts pre-fetched trust + tier
 * values so it can be called inside a DB transaction. The async
 * `resolveCommissionRate` in apps/storefront/src/lib/membership/commission.ts
 * delegates to this after looking up the inputs.
 */
export function resolveCommission(inputs: CommissionInputs): ResolvedCommission {
  const trustRate = inputs.kind === "p2p"
    ? commissionRateForScore(inputs.trustScore)
    : DEFAULT_AUCTION_COMMISSION_RATE;
  let rate: number;
  let source: "membership" | "trust" | "default";
  if (inputs.tierRate !== null && inputs.tierRate < trustRate) {
    rate = inputs.tierRate;
    source = "membership";
  } else {
    rate = trustRate;
    source = inputs.trustScore >= 50 ? "trust" : "default";
  }
  return { rate, source, trustRate, membershipRate: inputs.tierRate };
}
