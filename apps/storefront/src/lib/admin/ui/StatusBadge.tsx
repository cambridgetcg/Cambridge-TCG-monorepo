/**
 * StatusBadge — unified pill for status-like enum values.
 *
 * Replaces three inconsistent STATUS_COLORS maps that lived in each
 * Dashboard page. The palette is shared but a page can override per-status
 * colors via the `palette` prop (e.g. for escrow-status semantics specific
 * to /commerce/market).
 *
 * Default palette covers the most common states across modules.
 */

import * as React from "react";

export type Tone =
  | "amber" | "red" | "emerald" | "blue" | "purple" | "neutral" | "green" | "sky";

const TONE_CLS: Record<Tone, string> = {
  amber:   "bg-accent/20 text-accent-strong border-accent/30",
  red:     "bg-danger/20 text-red-400 border-danger/30",
  emerald: "bg-emerald-500/20 text-secondary border-emerald-500/30",
  blue:    "bg-blue-500/20 text-blue-400 border-blue-500/30",
  purple:  "bg-purple-500/20 text-purple-400 border-purple-500/30",
  neutral: "bg-neutral-700 text-ink-muted border-neutral-600",
  green:   "bg-green-500/20 text-green-400 border-green-500/30",
  sky:     "bg-sky-500/20 text-info border-sky-500/30",
};

/**
 * Default palette — best-guess mapping for status names common across
 * storefront/wholesale schemas. Pages can override with `palette` prop.
 */
export const DEFAULT_PALETTE: Record<string, Tone> = {
  // generic / orders
  pending:    "amber",
  submitted:  "amber",
  open:       "amber",
  draft:      "neutral",
  scheduled:  "blue",
  active:     "emerald",
  live:       "emerald",
  approved:   "emerald",
  accepted:   "emerald",
  completed:  "green",
  paid:       "green",
  shipped:    "blue",
  delivered:  "green",
  // tradein lifecycle
  quoted:     "blue",
  received:   "blue",
  grading:    "purple",
  // negative
  declined:   "red",
  rejected:   "red",
  cancelled:  "neutral",
  failed:     "red",
  refunded:   "sky",
  expired:    "neutral",
  disputed:   "red",
  escalated:  "red",
  fraud:      "red",
  // email
  sent:       "emerald",
  queued:     "amber",
  dead:       "red",
  // auctions
  ended:      "amber",
};

interface StatusBadgeProps {
  status: string;
  /** Per-page override of the default palette. Status not in the override falls back to default, then "neutral". */
  palette?: Record<string, Tone>;
  /** Override the displayed text (e.g. "Awaiting Shipment" for "awaiting_shipment"). */
  label?: string;
  /** Visual size. */
  size?: "sm" | "md";
}

export function StatusBadge({ status, palette, label, size = "sm" }: StatusBadgeProps) {
  const tone: Tone = palette?.[status] ?? DEFAULT_PALETTE[status] ?? "neutral";
  const padding = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${padding} ${TONE_CLS[tone]}`}
    >
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}
