/**
 * Badge — unified pill for status-like enum values.
 *
 * Replaces 13+ inline STATUS_* maps that lived in /account/* and /prices/*.
 * Pages import a named palette from ./status-palettes and pass it via the
 * `palette` prop; the badge renders the right Tone for the status string.
 *
 * The Tone vocabulary is shared with the admin app's <StatusBadge> so a
 * status that means "good" looks the same on both sides of the kingdom.
 */

import * as React from "react";

export type Tone =
  | "amber" | "red" | "emerald" | "blue" | "purple" | "neutral" | "green" | "sky";

// blue/purple/green keep raw palette classes — no semantic token exists for them yet.
const TONE_CLS: Record<Tone, string> = {
  amber:   "bg-accent/15 text-accent-strong border-accent/30",
  red:     "bg-danger/15 text-danger border-danger/30",
  emerald: "bg-ok/15 text-ok border-ok/30",
  blue:    "bg-blue-500/15 text-blue-400 border-blue-500/30",
  purple:  "bg-purple-500/15 text-purple-400 border-purple-500/30",
  neutral: "bg-surface-elevated text-ink-muted border-border-subtle",
  green:   "bg-green-500/15 text-green-400 border-green-500/30",
  sky:     "bg-info/15 text-info border-info/30",
};

interface BadgeProps {
  /** The raw status string (e.g. "awaiting_payment"). */
  status: string;
  /** Per-domain palette mapping status → Tone. Falls back to "neutral" when unset. */
  palette?: Record<string, Tone>;
  /** Display label override — used when raw status differs from the human form. */
  label?: string;
  /** Per-domain label map; if set, overrides the underscored raw status. */
  labels?: Record<string, string>;
  /** Visual size. */
  size?: "sm" | "md";
}

export function Badge({ status, palette, label, labels, size = "sm" }: BadgeProps) {
  const tone: Tone = palette?.[status] ?? "neutral";
  const padding = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  const text = label ?? labels?.[status] ?? status.replace(/_/g, " ");
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${padding} ${TONE_CLS[tone]}`}
    >
      {text}
    </span>
  );
}
