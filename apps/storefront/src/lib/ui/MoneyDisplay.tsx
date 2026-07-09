/**
 * <MoneyDisplay> — math-aware, currency-aware money rendering primitive.
 *
 * Two cookies feed this component:
 *
 *   1. `lang-mode`        — phase B(2) of kingdom-077 (the-math-language.md
 *                            #27). Toggles natural-language ("£12.34") vs
 *                            math-mirror ({amount:1234,unit:"GBP-cents",
 *                            ratio:0.73}).
 *
 *   2. `display-currency` — Yu's 2026-05-14 directive. Toggles the six
 *                            currencies the price-guide selector supports
 *                            (GBP / USD / EUR / JPY / HKD / CHF). When a
 *                            caller doesn't pin `currency`, the value is
 *                            treated as **GBP** (platform canonical) and
 *                            converted to the cookie's currency for display.
 *
 * Two contracts:
 *
 *   <MoneyDisplay value={x} />
 *     → value is in GBP. Display follows the cookie. Math form's minor
 *       unit reflects the display currency.
 *
 *   <MoneyDisplay value={x} currency="JPY" />
 *     → pinned. Value is treated as already-in-JPY; no conversion happens
 *       regardless of cookie. Use this when displaying a foreign-currency
 *       upstream value that should never be re-converted (e.g. raw
 *       CardRush JPY).
 *
 * Adoption: callers using `formatPrice()` / `fmtGBP()` as inline strings
 * can switch to <MoneyDisplay value={...} /> to inherit both toggles.
 * Default visitors see no change today (GBP cookie → GBP display).
 */

import * as React from "react";
import { shortHash } from "../lang-mode";
import { getLangMode } from "../lang-mode-server";
import { getDisplayCurrency } from "../fx/currency-server";
import {
  fetchRates,
  convertFromGbp,
  CURRENCY_META,
  type Currency,
} from "../fx/rates";
import { formatPrice, fmtGBP } from "../format";

interface MoneyDisplayProps {
  /** The value in major currency units (e.g. 12.34 for £12.34). When
   *  `currency` is not provided, the value is interpreted as GBP and
   *  converted to the cookie's display currency. */
  value: number | string | null;
  /** Optional currency PIN. When supplied, the value is treated as
   *  already-in-currency; no conversion happens. Omit to let the
   *  cookie drive display. */
  currency?: Currency;
  /** Optional median value of comparable items (e.g. card prices in the
   *  same set). When provided, the math form emits `ratio: value/median`
   *  so a federation client can compare across currencies via ratios.
   *  Computed in the *source* currency (ratio is unit-invariant). */
  medianValue?: number | null;
  /** Optional className passthrough. */
  className?: string;
  /** Tolerant default rendering — if value is null, render "—". */
  tolerant?: boolean;
  /** When true, a zero value renders the same as null ("—" in default mode,
   *  `{amount:null,unit:...}` in math mode). Surfaces like the trader
   *  dashboard use zero to mean "no activity in this window"; the dash
   *  is more honest than "£0.00" in that context. */
  treatZeroAsMissing?: boolean;
}

export async function MoneyDisplay({
  value,
  currency,
  medianValue,
  className = "",
  tolerant = true,
  treatZeroAsMissing = false,
}: MoneyDisplayProps) {
  const mode = await getLangMode();

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

  // ── Decide the *display* currency + final magnitude ────────────────────
  //
  // Two paths:
  //   pinned → caller specified `currency`. Value is already in that
  //            currency; no conversion. Preserves prior contract.
  //   default → no pin. Value is GBP; convert to cookie currency.
  //
  // Reads `display-currency` cookie + fetches FX rates (Next.js framework
  // cache holds them 6h via `next: { revalidate: 21600 }`).

  let displayCurrency: Currency;
  let displayValue: number | null;

  if (currency) {
    // Pinned path — no cookie read, no conversion.
    displayCurrency = currency;
    displayValue = valid ? (numeric as number) : null;
  } else {
    // Default path — cookie-driven conversion from GBP.
    const cookieCurrency = await getDisplayCurrency();
    displayCurrency = cookieCurrency;
    if (!valid) {
      displayValue = null;
    } else if (cookieCurrency === "GBP") {
      // Skip the rate fetch when no conversion is needed.
      displayValue = numeric as number;
    } else {
      const rates = await fetchRates();
      displayValue = convertFromGbp(
        numeric as number,
        cookieCurrency,
        rates,
      );
    }
  }

  // ── Math mode ──────────────────────────────────────────────────────────

  if (mode === "math") {
    if (displayValue == null) {
      return (
        <code
          className={`inline-block text-[10px] font-mono text-ink-faint ${className}`}
          aria-label="value unavailable"
        >
          {`{amount:null,unit:"${displayCurrency}"}`}
        </code>
      );
    }
    // Minor-unit form. Zero-decimal currencies (JPY) carry their major
    // unit as-is; the rest are multiplied to cents.
    const decimals = CURRENCY_META[displayCurrency].decimals;
    const minorMultiplier = decimals === 0 ? 1 : 10 ** decimals;
    const amount = Math.round(displayValue * minorMultiplier);
    const unit = decimals === 0 ? displayCurrency : `${displayCurrency}-cents`;
    // Ratio is unit-invariant — compute in whichever source space the
    // numeric came in. Both inputs come from the same source space so the
    // ratio is the same number whether we converted or not.
    const ratio =
      medianValue != null && medianValue > 0 && numeric != null
        ? `,ratio:${(numeric / medianValue).toFixed(4)}`
        : "";
    const id = shortHash(`${displayCurrency}:${amount}`);
    const ariaPrefix = CURRENCY_META[displayCurrency].symbol;
    return (
      <code
        className={`inline-block text-[10px] font-mono text-ok px-1.5 py-0.5 rounded bg-surface-subtle border border-border-subtle ${className}`}
        aria-label={`${ariaPrefix}${displayValue}`}
      >
        {`{amount:${amount},unit:"${unit}"${ratio},_id:"${id}"}`}
      </code>
    );
  }

  // ── Default (natural-language) mode ────────────────────────────────────

  if (displayValue == null) {
    return tolerant ? <span className={className}>—</span> : null;
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

// Re-export the underlying string formatters for callers that want raw
// strings (e.g. aria-labels, server-side data attributes). These remain
// GBP-only — they don't know about the cookie. A caller that wants the
// cookie-aware string should use the <MoneyDisplay> component instead.
export { formatPrice, fmtGBP };
