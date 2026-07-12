/**
 * Multi-currency display rates — the price guide's "Today's Rates" table.
 *
 * Yu's directive 2026-05-14: *"Make the PRICE GUIDE compatible for all
 * currencies, create currency selector and create the rate table we used
 * for calculation."* Six currencies cover the platform's real audiences:
 *
 *   GBP — the platform's canonical currency (Cambridge TCG operates in £)
 *   USD — US visitor display (does not imply TCGplayer ingestion)
 *   EUR — continental EU visitor display (does not imply Cardmarket ingestion)
 *   JPY — CardRush source, Japanese visitors
 *   HKD — South-East Asia visitors (no direct upstream yet)
 *   CHF — Swiss visitors (no direct upstream yet)
 *
 * Substrate-honest about the rate's origin: every emission carries the
 * `source` (which upstream API answered) + `fetched_at` (when the rates
 * were last refreshed). The fallback table is marked `source: 'fallback'`
 * so the surface never silently degrades to stale numbers.
 *
 * The platform's *wholesale* prices live in GBP (column `price_gbp` on
 * cards). The wholesale ingest pipeline already converts JPY/USD source-
 * currencies to GBP at write time when a reviewed source is active, using
 * `apps/wholesale/src/lib/fx.ts`.
 * This storefront-side module is for **display only** — converting the
 * canonical GBP retail prices to whatever currency the visitor chose.
 *
 * Pure server module. `fetchRates()` uses Next.js's `fetch` revalidate
 * to cache 6h; pure helpers are safe everywhere.
 */

// ── Currency catalog ────────────────────────────────────────────────────

export const SUPPORTED_CURRENCIES = ["GBP", "USD", "EUR", "JPY", "HKD", "CHF"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const DEFAULT_CURRENCY: Currency = "GBP";

export interface CurrencyMeta {
  /** ISO 4217 code, same as the type. */
  code: Currency;
  /** Display symbol. */
  symbol: string;
  /** Human-readable name. */
  name: string;
  /** Locale used by Intl.NumberFormat for grouping/decimal style. */
  locale: string;
  /** Number of fractional digits to display. JPY uses 0. */
  decimals: number;
}

export const CURRENCY_META: Record<Currency, CurrencyMeta> = {
  GBP: { code: "GBP", symbol: "£", name: "Pound Sterling",   locale: "en-GB", decimals: 2 },
  USD: { code: "USD", symbol: "$", name: "US Dollar",        locale: "en-US", decimals: 2 },
  EUR: { code: "EUR", symbol: "€", name: "Euro",             locale: "en-IE", decimals: 2 },
  JPY: { code: "JPY", symbol: "¥", name: "Japanese Yen",     locale: "ja-JP", decimals: 0 },
  HKD: { code: "HKD", symbol: "HK$", name: "Hong Kong Dollar", locale: "en-HK", decimals: 2 },
  CHF: { code: "CHF", symbol: "CHF", name: "Swiss Franc",     locale: "de-CH", decimals: 2 },
};

/** Type guard. Returns the typed currency if recognized, else null. */
export function parseCurrency(raw: string | undefined | null): Currency | null {
  if (!raw) return null;
  const u = raw.toUpperCase();
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(u)
    ? (u as Currency)
    : null;
}

// ── Rate table types ────────────────────────────────────────────────────

export type RateSource =
  | "open.er-api.com"
  | "exchangerate.host"
  | "fallback";

export interface RateTable {
  /** Base currency the rates are quoted against (always GBP here). */
  base: Currency;
  /** Rate per 1 unit of base, keyed by target currency.
   *  e.g. rates.JPY = 188.5 means 1 GBP = 188.5 JPY. */
  rates: Record<Currency, number>;
  /** Which upstream produced these rates. */
  source: RateSource;
  /** ISO 8601 of when the rates were retrieved. */
  fetched_at: string;
  /** True when the upstream live-fetch failed and we fell back to the
   *  static table. The price-guide surfaces an amber pill in this case
   *  so the visitor knows the conversion is approximate. */
  is_fallback: boolean;
}

// ── Fallback rates ──────────────────────────────────────────────────────
// Approximate mid-market rates as of 2026-05. The price guide degrades
// to these when both upstreams fail. They're intentionally rounded — a
// visitor who needs accurate FX should hit a real-time source. The
// substrate-honesty contract is: when these are in play, the surface
// shows the `fallback` pill so nobody mistakes them for live data.

export const FALLBACK_RATES: Record<Currency, number> = {
  GBP: 1.0,
  USD: 1.27,
  EUR: 1.17,
  JPY: 188.5,
  HKD: 9.92,
  CHF: 1.12,
};

const FALLBACK_FETCHED_AT = "2026-05-14T00:00:00.000Z";

// ── Live fetch ──────────────────────────────────────────────────────────

interface ErApiResponse {
  result?: string;
  base_code?: string;
  rates?: Record<string, number>;
  time_last_update_utc?: string;
}

interface ExchangeRateHostResponse {
  success?: boolean;
  base?: string;
  rates?: Record<string, number>;
  date?: string;
}

/**
 * Pluck the six supported targets from an upstream's response, ensuring
 * GBP is always 1.0 (base) and every target carries a positive number.
 * Returns null if any target is missing or non-positive — the caller
 * falls through to the next upstream.
 */
function selectSupportedRates(
  raw: Record<string, number> | undefined,
): Record<Currency, number> | null {
  if (!raw) return null;
  const out = {} as Record<Currency, number>;
  for (const c of SUPPORTED_CURRENCIES) {
    if (c === "GBP") {
      out[c] = 1.0;
      continue;
    }
    const v = raw[c];
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
    out[c] = v;
  }
  return out;
}

/**
 * Fetch live GBP-base rates for the six supported currencies.
 *
 * Cached for 6 hours via Next.js's `fetch` revalidate. Successive calls
 * within that window return the same result without an upstream hit.
 *
 * Returns the static FALLBACK_RATES when both upstreams fail. Callers
 * can inspect `is_fallback` to render an honesty pill on the surface.
 */
export async function fetchRates(): Promise<RateTable> {
  // Primary: open.er-api.com (free, no key, daily-refreshed).
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/GBP", {
      next: { revalidate: 21_600 },
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const data = (await res.json()) as ErApiResponse;
      const picked = selectSupportedRates(data?.rates);
      if (picked && (data.base_code ?? "GBP").toUpperCase() === "GBP") {
        return {
          base: "GBP",
          rates: picked,
          source: "open.er-api.com",
          fetched_at: data.time_last_update_utc
            ? new Date(data.time_last_update_utc).toISOString()
            : new Date().toISOString(),
          is_fallback: false,
        };
      }
    }
  } catch {
    // fall through
  }

  // Fallback: exchangerate.host.
  try {
    const res = await fetch("https://api.exchangerate.host/latest?base=GBP", {
      next: { revalidate: 21_600 },
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const data = (await res.json()) as ExchangeRateHostResponse;
      const picked = selectSupportedRates(data?.rates);
      if (picked && (data.base ?? "GBP").toUpperCase() === "GBP") {
        return {
          base: "GBP",
          rates: picked,
          source: "exchangerate.host",
          fetched_at: data.date
            ? new Date(data.date).toISOString()
            : new Date().toISOString(),
          is_fallback: false,
        };
      }
    }
  } catch {
    // fall through
  }

  // Final fallback — static table.
  return {
    base: "GBP",
    rates: { ...FALLBACK_RATES },
    source: "fallback",
    fetched_at: FALLBACK_FETCHED_AT,
    is_fallback: true,
  };
}

// ── Pure conversion helpers ─────────────────────────────────────────────

/**
 * Convert a GBP magnitude to the target currency using the supplied rate
 * table. Returns null when the input is null/non-finite — substrate-
 * honest about absence rather than fabricating 0.
 */
export function convertFromGbp(
  valueGbp: number | null | undefined,
  target: Currency,
  table: RateTable,
): number | null {
  if (valueGbp == null || !Number.isFinite(valueGbp)) return null;
  const rate = table.rates[target];
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return valueGbp * rate;
}

/**
 * Format a value (already in `currency`) as a display string. JPY uses
 * 0 decimals, others use 2. Locale follows CURRENCY_META.
 *
 * Pass a `null` value to render "—" — keeps callers free of conditionals.
 */
export function formatMoney(
  value: number | null,
  currency: Currency,
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const meta = CURRENCY_META[currency];
  const formatted = value.toLocaleString(meta.locale, {
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  });
  // HKD/CHF prefer a space between symbol and amount in their locale
  // conventions; GBP/USD/EUR/JPY hug the symbol.
  const space = currency === "HKD" || currency === "CHF" ? " " : "";
  return meta.symbol + space + formatted;
}

/**
 * One-shot: convert GBP → target → display string. The page-level
 * convenience wrapper most callers want.
 */
export function formatGbpAs(
  valueGbp: number | null | undefined,
  target: Currency,
  table: RateTable,
): string {
  const converted = convertFromGbp(valueGbp, target, table);
  return formatMoney(converted, target);
}
