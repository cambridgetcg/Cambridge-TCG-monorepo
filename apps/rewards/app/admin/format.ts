import type { Decimal } from "decimal.js";
import { Money, currencyDecimals, roundMoney } from "~/lib/money";
import type { OrderStatusLabel } from "~/lib/order-status";

/**
 * Display formatting for the admin pages. Not a .server module: components
 * use it too.
 */

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

/** The badge tone of each order status (spec 4.6). */
export const ORDER_STATUS_TONE: Record<OrderStatusLabel, "success" | "warning" | "neutral" | "info"> = {
  Issued: "success",
  Waiting: "info",
  "Needs a look": "warning",
  "Taken back": "neutral",
  "No cashback": "neutral",
};
