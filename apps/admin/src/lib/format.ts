/**
 * Display-format helpers shared across admin pages.
 *
 * Server-safe: pure functions, no React, no DOM.
 * Locale: en-GB throughout (UK-first product).
 */

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const JPY = new Intl.NumberFormat("en-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat("en-GB");

type Maybe<T> = T | null | undefined;

function toNum(v: Maybe<string | number>): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** £1,234.56 — returns "—" for null/undefined/non-numeric. */
export function fmtGBP(v: Maybe<string | number>): string {
  const n = toNum(v);
  return n == null ? "—" : GBP.format(n);
}

/** ¥1,234 — returns "—" for null/undefined/non-numeric. */
export function fmtJPY(v: Maybe<string | number>): string {
  const n = toNum(v);
  return n == null ? "—" : JPY.format(n);
}

/** 1,234 — returns "—" for null/undefined/non-numeric. */
export function fmtNumber(v: Maybe<string | number>): string {
  const n = toNum(v);
  return n == null ? "—" : NUM.format(n);
}

/** "5 Apr 2026" — short en-GB date. */
export function fmtDate(iso: Maybe<string | Date>): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** "5 Apr 2026, 14:30" — short en-GB datetime. */
export function fmtDateTime(iso: Maybe<string | Date>): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/** "3d ago" / "in 2h" — relative time, granular for recent dates. */
export function fmtRelative(iso: Maybe<string | Date>): string {
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
  return fmtDate(d);
}

/** Pluralise — "1 queue needs" vs "2 queues need". */
export function pluralize(n: number, singular: string, plural?: string): string {
  return n === 1 ? singular : (plural ?? singular + "s");
}

/** Verb agreement — "1 queue **needs** attention" vs "2 queues **need**". */
export function verb(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}
