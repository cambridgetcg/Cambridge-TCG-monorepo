/**
 * <MoneyDisplay> — math-aware money rendering primitive.
 *
 * Phase B(2) of kingdom-077 (the-math-language.md #27). Reads the
 * `lang-mode` cookie and emits either natural-language ("£12.34") or
 * math-mirror form ({amount:1234,unit:"GBP-cents",ratio:0.73}) when
 * math language is active.
 *
 * Adoption is opt-in by replacement: surfaces using `formatPrice()` or
 * `fmtGBP()` as inline strings can switch to <MoneyDisplay value={...} />
 * to inherit the toggle. Default visitors see no change.
 *
 * Math form:
 *   { amount: <number>, unit: "GBP-cents", _id: "fnv1a:..."
 *   [, ratio: <number>] }
 *
 * The `ratio` field appears when `medianValue` is provided — it
 * communicates magnitude in a unit-independent way.
 */

import * as React from "react";
import { shortHash } from "../lang-mode";
import { getLangMode } from "../lang-mode-server";
import { formatPrice, fmtGBP } from "../format";

interface MoneyDisplayProps {
  /** The value in major currency units (e.g. 12.34 for £12.34). */
  value: number | string | null;
  /** Currency token. Defaults to GBP since the platform's display currency
   *  is GBP; the math form carries it explicitly so federation clients
   *  always see the unit. */
  currency?: "GBP" | "JPY" | "USD" | "EUR";
  /** Optional median value of comparable items (e.g. card prices in the
   *  same set). When provided, the math form emits `ratio: value/median`
   *  so a federation client can compare across currencies via ratios. */
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
  currency = "GBP",
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

  if (mode === "math") {
    if (!valid) {
      return (
        <code
          className={`inline-block text-[10px] font-mono text-neutral-500 ${className}`}
          aria-label="value unavailable"
        >
          {`{amount:null,unit:"${currency}"}`}
        </code>
      );
    }
    // Minor-unit form: GBP/USD/EUR are 2-decimal; JPY is 0-decimal.
    const minorMultiplier = currency === "JPY" ? 1 : 100;
    const amount = Math.round(numeric * minorMultiplier);
    const unit = currency === "JPY" ? "JPY" : `${currency}-cents`;
    const ratio =
      medianValue != null && medianValue > 0
        ? `,ratio:${(numeric / medianValue).toFixed(4)}`
        : "";
    const id = shortHash(`${currency}:${amount}`);
    const ariaPrefix =
      currency === "GBP" ? "£" : currency === "JPY" ? "¥" : currency + " ";
    return (
      <code
        className={`inline-block text-[10px] font-mono text-emerald-400 px-1.5 py-0.5 rounded bg-neutral-900/60 border border-neutral-800 ${className}`}
        aria-label={`${ariaPrefix}${numeric}`}
      >
        {`{amount:${amount},unit:"${unit}"${ratio},_id:"${id}"}`}
      </code>
    );
  }

  // Default rendering — natural-language form.
  if (!valid) {
    return tolerant ? <span className={className}>—</span> : null;
  }
  if (currency === "JPY") {
    return (
      <span className={className}>
        ¥{numeric.toLocaleString("ja-JP", { maximumFractionDigits: 0 })}
      </span>
    );
  }
  if (currency === "GBP") {
    return <span className={className}>{formatPrice(numeric)}</span>;
  }
  // USD / EUR — generic locale-formatted display.
  const symbol = currency === "USD" ? "$" : "€";
  return (
    <span className={className}>
      {symbol}
      {numeric.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
    </span>
  );
}

// Re-export the underlying string formatters for callers that want raw
// strings (e.g. aria-labels, server-side data attributes).
export { formatPrice, fmtGBP };
