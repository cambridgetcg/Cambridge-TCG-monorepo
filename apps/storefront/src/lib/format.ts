/**
 * Display-format helpers shared across storefront pages.
 *
 * Server-safe: pure functions, no React, no DOM.
 * Locale: en-GB throughout (UK-first product).
 *
 * The price formatter is the original public surface; date / number /
 * relative-time helpers were added during the consumer-UI consolidation
 * so account-list pages stop re-rolling toLocaleDateString inline.
 */

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const NUM = new Intl.NumberFormat("en-GB");

type Maybe<T> = T | null | undefined;

function toNum(v: Maybe<string | number>): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Format a GBP price with proper £ symbol, leading zero, and comma separators.
 * Examples: 0.57 → "£0.57", 1234.5 → "£1,234.50"
 *
 * Strict variant — accepts a number, returns a string. Predates the rest of
 * this module; keep the contract.
 */
export function formatPrice(price: number): string {
  return "£" + price.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** £1,234.56 — tolerant variant: accepts string|number|null, returns "—" for non-numeric. */
export function fmtGBP(v: Maybe<string | number>): string {
  const n = toNum(v);
  return n == null ? "—" : GBP.format(n);
}

/** 1,234 — returns "—" for null/undefined/non-numeric. */
export function fmtNumber(v: Maybe<string | number>): string {
  const n = toNum(v);
  return n == null ? "—" : NUM.format(n);
}

/** "5 Apr 2026" — short en-GB date. Returns "—" for null/invalid. */
export function formatDate(iso: Maybe<string | Date>): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** "5 Apr 2026, 14:30" — short en-GB datetime. Returns "—" for null/invalid. */
export function formatDateTime(iso: Maybe<string | Date>): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/** "3d ago" / "in 2h" / "just now" — granular for recent dates, falls through to formatDate beyond 30d. */
export function formatRelativeTime(iso: Maybe<string | Date>): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  const diff = d.getTime() - Date.now();
  const absSec = Math.abs(diff) / 1000;
  const past = diff < 0;
  const fmt = (n: number, unit: string) => `${past ? "" : "in "}${n}${unit}${past ? " ago" : ""}`;
  if (absSec < 60) return past ? "just now" : "in <1m";
  if (absSec < 3600) return fmt(Math.round(absSec / 60), "m");
  if (absSec < 86400) return fmt(Math.round(absSec / 3600), "h");
  if (absSec < 86400 * 30) return fmt(Math.round(absSec / 86400), "d");
  return formatDate(d);
}

/**
 * Time-until countdown in compact form: "2h 15m" / "5m" / "elapsed".
 * Used by the offers / payment-window UIs where the *remaining* time is
 * the user-affecting value, not the absolute timestamp.
 */
export function formatTimeUntil(iso: Maybe<string | Date>): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  const ms = d.getTime() - Date.now();
  if (ms <= 0) return "elapsed";
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** Pluralise — "1 order" vs "2 orders". */
export function pluralize(n: number, singular: string, plural?: string): string {
  return n === 1 ? singular : (plural ?? singular + "s");
}

/**
 * Render a UUID as an opaque correlation id — the last 6 lowercase chars.
 *
 * Used on public-mirror surfaces (card-market tape, auction state's bids
 * + winner) to let a reader correlate within a small set ("three of these
 * were the same seller") without learning the platform's internal id.
 *
 * **Not a security boundary.** Any reader who can compose the underlying
 * UUID can derive the anon id; the inverse mapping is not protected. The
 * primitive's contract is *unlinkability across publications, not
 * unlinkability against a determined attacker*.
 *
 * Returns "------" (six dashes) for null/empty input so renderers can
 * insert the value directly into a table cell without conditionals.
 *
 * Extracted from `lib/market/card-market.ts` and `lib/auction/state.ts`
 * which both inlined the same logic; consolidated 2026-05-13.
 */
export function anonId(uuid: string | null | undefined): string {
  if (!uuid) return "------";
  return String(uuid).slice(-6).toLowerCase();
}
