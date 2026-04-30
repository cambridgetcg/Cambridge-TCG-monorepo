/**
 * KpiCard + KpiGrid — the canonical KPI tile used by every Dashboard page.
 *
 * Subsumes the three near-duplicate KpiCards previously inlined in
 * commerce/{trade-ins,auctions,market}/page.tsx.
 *
 * Urgency variants:
 *   critical → red       — block-of-the-day work (disputes, fraud, payouts due)
 *   warning  → amber     — needs attention soon (queue building up)
 *   info     → blue      — informational, usually-attended (queue status)
 *   ok       → emerald   — desirable state (live auctions, revenue)
 *   neutral  → white     — defaults to white text, no border tint
 */

import * as React from "react";
import Link from "next/link";

export type Urgency = "critical" | "warning" | "info" | "ok" | "neutral";

const VALUE_COLORS: Record<Urgency, string> = {
  critical: "text-red-400",
  warning: "text-amber-400",
  info: "text-blue-400",
  ok: "text-emerald-400",
  neutral: "text-white",
};

const BORDER_COLORS: Record<Urgency, string> = {
  critical: "border-red-500/30 bg-red-500/5",
  warning: "border-amber-500/30 bg-amber-500/5",
  info: "border-blue-500/30 bg-blue-500/5",
  ok: "border-emerald-500/30 bg-emerald-500/5",
  neutral: "border-neutral-800 bg-neutral-900",
};

interface KpiCardProps {
  label: string;
  value: string | number;
  /** Subtitle under the value, e.g. "needs action" or a date. */
  sub?: string;
  /** Drives color. Defaults to "neutral". */
  urgency?: Urgency;
  /** If set, the entire card becomes a link. */
  href?: string;
  /** When true, the value is rendered as `—` (data-unavailable indicator). */
  unavailable?: boolean;
  /** When true, dim the card to indicate "0 / nothing to see". Used by overview. */
  empty?: boolean;
}

export function KpiCard({
  label,
  value,
  sub,
  urgency = "neutral",
  href,
  unavailable,
  empty,
}: KpiCardProps) {
  const isLink = Boolean(href);
  const content = (
    <>
      <p className="text-xs text-neutral-500 uppercase tracking-wide">{label}</p>
      <p
        className={[
          "text-2xl font-bold mt-1 tabular-nums",
          empty ? "text-neutral-600" : VALUE_COLORS[urgency],
        ].join(" ")}
      >
        {unavailable ? "—" : value}
      </p>
      {sub && <p className="text-xs text-neutral-500 mt-1">{sub}</p>}
    </>
  );

  const className = [
    "block rounded-xl border p-4 transition-colors",
    empty ? "border-neutral-800 bg-neutral-900/50" : BORDER_COLORS[urgency],
    isLink ? "hover:bg-neutral-800" : "",
  ].join(" ");

  return isLink ? (
    <Link href={href!} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

/** Responsive grid container for KpiCards — 2 / 3 / 4 / 5 / 6 cols depending on count. */
export function KpiGrid({
  cols = 4,
  children,
}: {
  cols?: 2 | 3 | 4 | 5 | 6;
  children: React.ReactNode;
}) {
  const colClass: Record<number, string> = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
    5: "sm:grid-cols-3 lg:grid-cols-5",
    6: "sm:grid-cols-3 lg:grid-cols-6",
  };
  return (
    <div className={`grid grid-cols-2 ${colClass[cols]} gap-3`}>{children}</div>
  );
}
