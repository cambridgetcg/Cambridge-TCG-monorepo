import type { Decimal } from "decimal.js";
import { Money, currencyDecimals, roundMoney } from "~/lib/money";

/**
 * Display formatting for the admin pages. Not a .server module: components
 * use it too.
 */

/** A day as the admin shows it, on every page and Home's banner: "June 5, 2026", in `timezone`. */
export function formatDay(date: Date | string, timezone: string): string {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: timezone }).format(new Date(date));
}

/**
 * An amount as the merchant reads it: `formatMoney(62, "JPY")` is "¥62",
 * `formatMoney("1.5000", "GBP")` is "£1.50", and KWD shows three decimals.
 * Rounded half-up to the currency's minor unit (rule 3) and formatted from
 * the exact decimal string, so no digit passes through a float. `locale`
 * defaults to "en". Throws UnknownCurrencyError for a code that is not a
 * currency: an amount is never shown in a guessed one.
 */
export function formatMoney(amount: Decimal | number | string, currency: string, locale = "en"): string {
  const decimals = currencyDecimals(currency);
  const exact = roundMoney(new Money(amount), currency).toFixed(decimals);
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  // Intl formats a decimal string exactly (ES2023); this project's lib
  // setting (ES2022) types format() for numbers only.
  return (formatter.format as unknown as (value: string) => string)(exact);
}
