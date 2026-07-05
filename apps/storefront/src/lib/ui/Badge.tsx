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

/**
 * The quiet gallery re-tune (docs/plans/the-quiet-gallery.md): the same
 * eight tones, re-expressed in the muted palette — wash background at
 * /15, tone-colored text, hairline /30 border. Semantic meaning is
 * unchanged; only the values quieted. Purple / green / sky have no
 * @theme token yet, so they carry muted literals chosen to sit beside
 * the doctrine tones (plum / moss / teal). This map is the single home
 * for tone values — status-palettes.ts keeps mapping statuses to tone
 * *names* only.
 */
const TONE_CLS: Record<Tone, string> = {
  amber:   "bg-warning/15 text-warning border-warning/30",
  red:     "bg-danger/15 text-danger border-danger/30",
  emerald: "bg-ok/15 text-ok border-ok/30",
  blue:    "bg-info/15 text-info border-info/30",
  purple:  "bg-[#6a5a8f]/15 text-[#6a5a8f] border-[#6a5a8f]/30",
  neutral: "bg-ink-faint/15 text-ink-muted border-ink-faint/30",
  green:   "bg-[#567436]/15 text-[#567436] border-[#567436]/30",
  sky:     "bg-[#3e7d8f]/15 text-[#3e7d8f] border-[#3e7d8f]/30",
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
