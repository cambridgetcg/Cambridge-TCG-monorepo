/** Decimal amounts are major currency units, never provider-specific minor units.
 * This is representation/validation only: it does not convert currencies,
 * establish a price's meaning, or grant permission to publish an observation.
 */
export type MoneyCurrency = "GBP" | "EUR" | "USD" | "JPY";
export interface Money {
  amount: string;
  currency: MoneyCurrency;
  unit: "major";
}

/** Keep decimal text and its supplied precision. Missing is null; zero is valid.
 * Bounds match MONEY_SCHEMA in data-spec. Exponents, signs, separators and
 * whitespace are rejected rather than silently interpreted as another amount.
 */
export function parseMajorAmount(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === "number" && Number.isFinite(value) ? String(value) : value;
  if (typeof text !== "string" || !/^\d{1,12}(?:\.\d{1,6})?$/.test(text)) {
    throw new RangeError("Amount must be a nonnegative decimal in major units (12 integer and 6 fractional digits maximum).");
  }
  return text;
}

export function money(value: unknown, currency: MoneyCurrency): Money | null {
  if (!["GBP", "EUR", "USD", "JPY"].includes(currency)) {
    throw new RangeError("Unsupported currency.");
  }
  const amount = parseMajorAmount(value);
  return amount === null ? null : { amount, currency, unit: "major" };
}

/** Compatibility for existing numeric GBP APIs. Never substitutes zero for
 * missing data, and never accepts Infinity, negative amounts or coercible text.
 */
export function positivePrice(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

/** Round a nonnegative major-unit amount to a penny, rejecting unsafe results. */
export function roundGbp(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER / 100) {
    throw new RangeError("GBP amount is outside the supported finite penny range.");
  }
  // Scale-aware tolerance repairs binary representations of decimal half-pennies.
  const scaled = value * 100;
  return Math.round(scaled + Math.min(Number.EPSILON * Math.abs(scaled), 1e-7)) / 100;
}
