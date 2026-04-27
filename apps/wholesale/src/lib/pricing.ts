// ── Channel-aware pricing engine ─────────────────────────────────────────────
// Pure computation — no DB access. See channel-pricing.ts for the cached DB layer.

export interface ChannelConfig {
  channel: string;
  marginMultiplier: number;
  flatFeeSingles: number;
  flatFeeSealed: number;
  vatMultiplier: number;
  retailMultiplier: number;
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

// ── Default configs for all known channels ──────────────────────────────────

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

// ── Core computation ────────────────────────────────────────────────────────

function roundTo(n: number, step: number): number {
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
  const price = roundTo(preRound, config.roundTo);

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

// ── Backwards-compatible exports ────────────────────────────────────────────

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
