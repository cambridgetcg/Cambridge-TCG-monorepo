/**
 * Trends computed on read (ctcg.market-derived/v1: "7, 30 and 90 day changes
 * are computed on read from reference and index history; they are not
 * stored"). Exact decimal arithmetic on the published decimal text, as the
 * method's own helpers do; no binary float enters a served change.
 */

export const TREND_DAYS = [7, 30, 90] as const;
export type TrendWindow = `d${(typeof TREND_DAYS)[number]}`;
/** A change compares with the latest published level on or before N days
 * earlier, at most this many days before that. A wider gap has no change. */
export const TREND_BASE_GRACE_DAYS = 7;
export const CHANGE_PERCENT_SCALE = 2;

const DECIMAL = /^(\d+)(?:\.(\d+))?$/;

function positive(value: unknown, label: string): { n: bigint; d: bigint } {
  if (typeof value !== "string") throw new TypeError(`${label} must be a decimal string.`);
  const match = DECIMAL.exec(value);
  if (!match) throw new RangeError(`${label} must be a plain decimal string.`);
  const fraction = match[2] ?? "";
  const n = BigInt(match[1] + fraction);
  if (n === 0n) throw new RangeError(`${label} must be positive.`);
  return { n, d: 10n ** BigInt(fraction.length) };
}

/** 100 × (current ÷ base − 1), rounded half away from zero to
 * CHANGE_PERCENT_SCALE places, canonical: no trailing fractional zeros,
 * "0" for no change, a leading "-" for a fall. percentChange("110", "100") → "10". */
export function percentChange(current: string, base: string): string {
  const c = positive(current, "Current level"), b = positive(base, "Base level");
  const scale = 10n ** BigInt(CHANGE_PERCENT_SCALE);
  const numerator = (c.n * b.d - b.n * c.d) * 100n * scale;
  const denominator = c.d * b.n;
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const units = (2n * magnitude + denominator) / (2n * denominator);
  if (units === 0n) return "0";
  const digits = units.toString().padStart(CHANGE_PERCENT_SCALE + 1, "0");
  const whole = digits.slice(0, -CHANGE_PERCENT_SCALE);
  const fraction = digits.slice(-CHANGE_PERCENT_SCALE).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}
