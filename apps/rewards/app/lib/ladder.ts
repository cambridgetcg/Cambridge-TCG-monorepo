import type { Decimal } from "decimal.js";
import { Money, currencyDecimals, fromDb, roundMoney } from "./money";

/**
 * The guide's ladder (RP-24 spec 4.4): buyers bucketed by tier spend into
 * bins of one round width, so the page can count buyers per tier and replay
 * what the tiers would have given without asking the server again. Pure and
 * browser-safe: the page imports it as well as ladder.server.ts.
 */

/** Bins per picture; the last one holds every spend above it. */
export const MAX_BINS = 200;

/** Fewer buyers who spent anything than this, and percentiles are noise: the starts fall back. */
export const MIN_SPENDERS = 20;

/** Currencies whose amounts sit close enough to the pound for 200 and 500 to mean the same. */
export const POUND_LIKE: ReadonlySet<string> = new Set(["GBP", "EUR", "USD", "CAD", "AUD", "NZD", "CHF", "SGD"]);

/** Whole-unit starts of tiers 1, 2 and 3; tier 1 is always 0. */
export type Starts = [number, number, number];

/** A typed start or minimum spend as the page and saveLadder both take it: whole units, up to 12 digits. */
export const WHOLE_AMOUNT = /^\d{1,12}$/;

/** The smallest of 1, 2, 5 × 10^k at least `n`, and at least 1. */
export function niceStep(n: number): number {
  if (!(n > 1)) return 1;
  if (!Number.isFinite(n)) throw new RangeError(`Not a finite step: ${n}`);
  for (let power = 1; ; power *= 10) {
    for (const mantissa of [1, 2, 5]) {
      if (mantissa * power >= n) return mantissa * power;
    }
  }
}

/** A round width that spreads spends up to the 99th percentile over about 100 bins; 10 with no data. */
export function binWidthFor(p99: Decimal | null): number {
  if (p99 === null) return 10;
  return niceStep(new Money(p99).div(100).ceil().toNumber());
}

/** The bin a spend falls in; the last bin holds everything above the picture. */
export function binOf(spend: Decimal, binWidth: number): number {
  const bin = new Money(spend).div(binWidth).floor().toNumber();
  return Math.max(0, Math.min(bin, MAX_BINS - 1));
}

/** The tier (0, 1 or 2) a bin belongs to, by the spend it starts at: the rule countsFor, costFor and the picture share. */
export function tierOfBin(bin: number, binWidth: number, starts: Starts): 0 | 1 | 2 {
  const binStart = bin * binWidth;
  if (binStart >= starts[2]) return 2;
  if (binStart >= starts[1]) return 1;
  return 0;
}

/** Buyers per tier: each bin's buyers go to the tier its start falls in. */
export function countsFor(buyers: number[], binWidth: number, starts: Starts): [number, number, number] {
  const counts: [number, number, number] = [0, 0, 0];
  buyers.forEach((count, bin) => {
    counts[tierOfBin(bin, binWidth, starts)] += count;
  });
  return counts;
}

/**
 * What the tiers would have given: each bin's earning base (sent as text)
 * at the rate of the tier its start falls in, summed exactly in Money and
 * rounded once, half-up, to the currency's minor unit.
 */
export function costFor(
  earnBase: string[],
  binWidth: number,
  starts: Starts,
  rates: [number, number, number],
  currency: string,
): Decimal {
  let total = new Money(0);
  earnBase.forEach((base, bin) => {
    total = total.plus(fromDb(base).times(rates[tierOfBin(bin, binWidth, starts)]).div(100));
  });
  return roundMoney(total, currency);
}

/** 200 and 500 where those amounts mean what they do in pounds; nothing elsewhere (no exchange rates). */
export function fallbackStarts(currency: string): [number, number] | null {
  return POUND_LIKE.has(currency) ? [200, 500] : null;
}

/** Up to the next multiple of the bin width, and at least one bin. */
function upToGrid(amount: Decimal, binWidth: number): number {
  return Math.max(binWidth, new Money(amount).div(binWidth).ceil().times(binWidth).toNumber());
}

/**
 * Starts for tiers 2 and 3 from the store's own buyers (about the 80th and
 * 95th percentiles of those who spent anything, up to the bin grid, the
 * second at least one bin above the first), but only from a finished import
 * that reached 12 months back and enough buyers; else the fallbacks.
 */
export function suggestStarts(o: {
  p80: Decimal | null;
  p95: Decimal | null;
  spenders: number;
  binWidth: number;
  horizonDays: number;
  importState: string;
  currency: string;
}): { starts: [number, number] | null; fromData: boolean } {
  if (o.importState === "done" && o.horizonDays >= 365 && o.spenders >= MIN_SPENDERS && o.p80 !== null && o.p95 !== null) {
    const second = upToGrid(o.p80, o.binWidth);
    const third = Math.max(upToGrid(o.p95, o.binWidth), second + o.binWidth);
    return { starts: [second, third], fromData: true };
  }
  return { starts: fallbackStarts(o.currency), fromData: false };
}

/**
 * The smallest base whose cashback at `percent` rounds half-up to at least
 * one minor unit: half a minor unit over the rate, up to the currency's
 * decimals. Null at 0% or below, where nothing earns.
 */
export function minEarningBase(percent: number, currency: string): Decimal | null {
  if (!(percent > 0)) return null;
  const decimals = currencyDecimals(currency);
  const halfMinorUnit = new Money(10).pow(-decimals).div(2);
  return halfMinorUnit.div(new Money(percent).div(100)).toDecimalPlaces(decimals, Money.ROUND_CEIL);
}

/** Two typed starts as saveLadder takes them: whole, at most 12 digits, and 0 < start2 < start3. */
export function validStarts(start2: string, start3: string): [number, number] | null {
  const second = start2.trim();
  const third = start3.trim();
  if (!WHOLE_AMOUNT.test(second) || !WHOLE_AMOUNT.test(third)) return null;
  const starts: [number, number] = [Number(second), Number(third)];
  return starts[0] > 0 && starts[0] < starts[1] ? starts : null;
}

/** A dragged start on the nearest multiple of the bin width, and at least one bin. */
export function snap(value: number, binWidth: number): number {
  return Math.max(binWidth, Math.round(value / binWidth) * binWidth);
}

/**
 * Where counts and cost take a typed start from (R9): the start of the bin
 * it falls in, so the figures match the picture's bars, and at least one
 * bin, since bin 0 holds the buyers who spent nothing and they are always in
 * tier 1. Only for the figures: the field keeps what was typed.
 */
export function onGrid(start: number, binWidth: number): number {
  return Math.max(binWidth, Math.floor(start / binWidth) * binWidth);
}

/** The 1, 2 or 5 × 10^k nearest `n`, up on a tie, and at least 1. */
function nearestStep(n: Decimal): Decimal {
  const up = new Money(niceStep(n.toNumber()));
  if (up.lte(1)) return up;
  // The step below the one above: 5 below 10 and 1 below 2 are halves, 2 below 5 is two fifths
  const down = up.toFixed().startsWith("5") ? up.times(2).div(5) : up.div(2);
  return up.minus(n).lte(n.minus(down)) ? up : down;
}

/** A round order for the worked example: the step nearest the store's median when known, else 100 near the pound. */
export function exampleOrder(medianOrder: Decimal | null, currency: string): Decimal | null {
  if (medianOrder !== null) return nearestStep(new Money(medianOrder));
  return POUND_LIKE.has(currency) ? new Money(100) : null;
}

/** The fewest bins the picture shows, so a store whose buyers all spent little still has a scale. */
const PICTURE_MIN_BINS = 20;

/**
 * The bins the picture shows (R21): the range that holds 99% of buyers and a
 * quarter more, at least PICTURE_MIN_BINS, with every bin above it folded
 * into its last bar. Every buyer is still in it. Only for the picture:
 * counts and cost keep the full grid. With no buyers, the bins as they are.
 */
export function pictureBins(buyers: number[]): number[] {
  const total = buyers.reduce((sum, count) => sum + count, 0);
  if (total === 0) return [...buyers];
  // The fewest leading bins that hold at least 99% of buyers, in whole numbers
  let n99 = 0;
  let held = 0;
  while (held * 100 < total * 99) {
    held += buyers[n99];
    n99 += 1;
  }
  const shown = Math.min(buyers.length, Math.max(PICTURE_MIN_BINS, Math.ceil(n99 * 1.25)));
  const above = buyers.slice(shown - 1).reduce((sum, count) => sum + count, 0);
  return [...buyers.slice(0, shown - 1), above];
}
