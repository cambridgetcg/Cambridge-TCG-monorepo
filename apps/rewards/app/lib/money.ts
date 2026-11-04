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
    super(`Unknown currency code ${JSON.stringify(code)}: expected three uppercase letters`);
    this.name = "UnknownCurrencyError";
  }
}

const decimalsCache = new Map<string, number>();

/** The currency's minor-unit digits: GBP 2, JPY 0, KWD 3. */
export function currencyDecimals(code: string): number {
  if (!/^[A-Z]{3}$/.test(code)) throw new UnknownCurrencyError(code);
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

/** The amount string Shopify's MoneyInput takes: exactly the currency's decimals, never exponent form. */
export function toShopifyAmount(v: Decimal, currency: string): string {
  return new Money(v).toFixed(currencyDecimals(currency), Money.ROUND_HALF_UP);
}

/**
 * Whether `v` fits a Postgres numeric(precision, scale) column once rounded
 * to its scale. A larger value fails the whole write ("numeric field
 * overflow"). Carried from apps/rewardspro/app/utils/fits-numeric.ts, on
 * Decimal instead of number.
 */
export function fitsNumeric(v: Decimal, precision: number, scale: number): boolean {
  const value = new Money(v);
  if (!value.isFinite()) return false;
  return value.toDecimalPlaces(scale, Money.ROUND_HALF_UP).abs().lt(new Money(10).pow(precision - scale));
}
