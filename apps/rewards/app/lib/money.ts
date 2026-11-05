import { Decimal } from "decimal.js";

/**
 * Every money value in the engine is a Money: exact decimal, rounded
 * half-up (away from zero, as Postgres numeric rounds), with enough
 * significant digits that numeric(19,4) arithmetic never rounds by accident.
 * A clone, so nothing else's Decimal settings change.
 */
export const Money: typeof Decimal = Decimal.clone({
  rounding: Decimal.ROUND_HALF_UP,
  precision: 40,
});

/**
 * The currency cashback is issued in (spec 6.3 rule 4, plan Decision 14).
 *
 * Checked 2026-11-04 on https://help.shopify.com/en/manual/customers/store-credit
 * ("Subscription and currency limitations"): "If a customer has store credit
 * issued to their account in multiple currencies, then only the store credit
 * balance that matches the currency of your checkout displays to the customer
 * at checkout." The page says nothing of converting credit, so credit only
 * applies at a checkout in its own currency, and cashback is issued in the
 * currency the buyer paid in. Were Shopify to convert, this would be "shop".
 */
export const ISSUE_IN: "presentment" | "shop" = "presentment";

export class UnknownCurrencyError extends Error {
  constructor(readonly code: string) {
    super(`Unknown currency code ${JSON.stringify(code)}: expected an ISO 4217 code this runtime lists`);
    this.name = "UnknownCurrencyError";
  }
}

const decimalsCache = new Map<string, number>();

// The codes the runtime knows. Intl.NumberFormat does not throw for a well
// formed code it does not know ("ZZZ" formats with 2 decimals), so a code
// is checked against this list as well as its shape.
const KNOWN_CURRENCIES: ReadonlySet<string> = new Set(Intl.supportedValuesOf("currency"));

/**
 * The currency's minor-unit digits: GBP 2, JPY 0, KWD 3. They come from the
 * runtime's ICU data, which differs from ISO 4217 for a few codes (HUF and
 * IDR give 0); test/unit/lib/money.test.ts pins today's values.
 */
export function currencyDecimals(code: string): number {
  if (!/^[A-Z]{3}$/.test(code) || !KNOWN_CURRENCIES.has(code)) throw new UnknownCurrencyError(code);
  let decimals = decimalsCache.get(code);
  if (decimals === undefined) {
    decimals = new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions()
      .maximumFractionDigits as number;
    decimalsCache.set(code, decimals);
  }
  return decimals;
}

/** Half-up to the currency's minor unit (rule 3). */
export function roundMoney(v: Decimal.Value, currency: string): Decimal {
  return new Money(v).toDecimalPlaces(currencyDecimals(currency), Money.ROUND_HALF_UP);
}

/** Down to the currency's minor unit, for refund shares (rule 3). */
export function floorMoney(v: Decimal.Value, currency: string): Decimal {
  return new Money(v).toDecimalPlaces(currencyDecimals(currency), Money.ROUND_FLOOR);
}

/** base × percent / 100, rounded once, half-up, to the minor unit. */
export function cashbackFor(base: Decimal.Value, percent: Decimal.Value, currency: string): Decimal {
  return roundMoney(new Money(base).times(percent).div(100), currency);
}

/**
 * The amount string Shopify's MoneyInput takes: exactly the currency's
 * decimals, never exponent form. Throws RangeError unless the value, rounded
 * to those decimals, is a finite amount greater than 0: nothing is ever sent
 * for a zero or negative amount.
 */
export function toShopifyAmount(v: Decimal, currency: string): string {
  const rounded = roundMoney(v, currency);
  if (!(rounded.isFinite() && rounded.gt(0))) {
    throw new RangeError(`Not a positive ${currency} amount: ${new Money(v).toString()}`);
  }
  return rounded.toFixed(currencyDecimals(currency));
}

/**
 * Whether `v` fits a Postgres numeric(precision, scale) column once rounded
 * to its scale. A larger value fails the whole write ("numeric field
 * overflow"). Carried from apps/rewardspro/app/utils/fits-numeric.ts, on
 * Decimal instead of number.
 */
export function fitsNumeric(v: Decimal, precision: number, scale: number): boolean {
  if (!(Number.isInteger(precision) && Number.isInteger(scale) && precision >= 1 && scale >= 0 && scale <= precision)) {
    throw new RangeError(`Not a numeric(precision, scale): numeric(${precision}, ${scale})`);
  }
  const value = new Money(v);
  if (!value.isFinite()) return false;
  return value.toDecimalPlaces(scale, Money.ROUND_HALF_UP).abs().lt(new Money(10).pow(precision - scale));
}
