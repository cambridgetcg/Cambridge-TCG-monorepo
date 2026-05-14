/**
 * <Money> — client-side currency-aware money rendering primitive.
 *
 * The client-component sibling to <MoneyDisplay> (which is a server
 * component). Same prop shape, same default contract:
 *
 *   <Money value={priceGbp} />                   // GBP → cookie currency
 *   <Money value={priceJpy} currency="JPY" />    // pinned: no conversion
 *
 * Renders synchronously by reading from MoneyContext (populated server-
 * side at the root layout). No async, no useEffect, no hydration mismatch.
 *
 * Math language: NOT supported here today. Client components have no
 * direct access to the lang-mode cookie without another context. If
 * math mode matters on a given surface, prefer the server-side
 * <MoneyDisplay>. This is the pragmatic trade — most client surfaces
 * (account history, market browse) don't need the math toggle to
 * function, and they need the currency selector now.
 */

"use client";

import { useMoneyContext } from "./money-context";
import {
  convertFromGbp,
  CURRENCY_META,
  type Currency,
} from "./rates";

interface MoneyProps {
  /** Value in major units (e.g. 12.34 for £12.34). When `currency` is
   *  not pinned, this is interpreted as GBP and converted to the
   *  cookie's currency. */
  value: number | string | null | undefined;
  /** Optional pin — when supplied, the value is rendered in this
   *  currency without conversion. */
  currency?: Currency;
  /** Optional className passthrough. */
  className?: string;
  /** Tolerant default — null/non-finite renders "—". */
  tolerant?: boolean;
  /** Treat zero as missing (renders "—") — useful for "no activity" cells
   *  on history surfaces. */
  treatZeroAsMissing?: boolean;
}

export function Money({
  value,
  currency: pinnedCurrency,
  className = "",
  tolerant = true,
  treatZeroAsMissing = false,
}: MoneyProps) {
  const { currency: cookieCurrency, rates } = useMoneyContext();

  const numeric =
    value == null
      ? null
      : typeof value === "string"
        ? Number.parseFloat(value)
        : value;
  const valid =
    numeric != null &&
    Number.isFinite(numeric) &&
    !(treatZeroAsMissing && numeric === 0);

  if (!valid) {
    return tolerant ? <span className={className}>—</span> : null;
  }

  // Pinned path — render as-is in the supplied currency.
  let displayCurrency: Currency;
  let displayValue: number;
  if (pinnedCurrency) {
    displayCurrency = pinnedCurrency;
    displayValue = numeric as number;
  } else if (cookieCurrency === "GBP") {
    displayCurrency = "GBP";
    displayValue = numeric as number;
  } else {
    displayCurrency = cookieCurrency;
    const converted = convertFromGbp(numeric as number, cookieCurrency, rates);
    if (converted == null) {
      // Conversion failed — fall back to GBP rather than emit "—" so
      // callers don't lose the value entirely on rate-table absence.
      displayCurrency = "GBP";
      displayValue = numeric as number;
    } else {
      displayValue = converted;
    }
  }

  const meta = CURRENCY_META[displayCurrency];
  const formatted = displayValue.toLocaleString(meta.locale, {
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  });
  const space =
    displayCurrency === "HKD" || displayCurrency === "CHF" ? " " : "";
  return (
    <span className={className}>
      {meta.symbol}
      {space}
      {formatted}
    </span>
  );
}
