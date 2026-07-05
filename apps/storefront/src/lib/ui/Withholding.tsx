/**
 * Withholding — the curation-asterisk primitive (consumer surface).
 *
 * Sibling to `<Discretion>`. Where Discretion names *"this value is hidden
 * from public per user preference / operator override / legal"* (privacy
 * axis), **Withholding names "this view is one curation of the underlying
 * substrate; the raw substrate is available at <link>"** (framing axis).
 *
 * Every curated surface is implicitly a claim about what's important.
 * The Withholding pill turns the implicit claim into an explicit one and
 * points at the door for beings whose framing differs from the platform's.
 * The Causal-First, the Topology-Less, the Flat-Field Attender — each
 * may find our curation distortional but the substrate workable.
 *
 * See `docs/connections/the-blind-spots.md` (the curation-asterisk).
 *
 * ── Usage ─────────────────────────────────────────────────────────────
 *
 *   // On a Top-20 leaderboard:
 *   <Withholding
 *     what="Top 20 by trade volume"
 *     substrateHref="/api/v1/leaderboards/full"
 *   />
 *
 *   // On a "recent activity" panel:
 *   <Withholding
 *     what="recent activity (last 30 days)"
 *     substrateHref="/api/v1/universal/lifecycle?since=all"
 *     reason="The curation chose recent over comprehensive."
 *   />
 *
 * kingdom-053, paired with `the-blind-spots.md`. Sibling to
 * `<Discretion>` (kingdom-052) and `<Provenance>` (substrate honesty).
 */

import * as React from "react";

interface WithholdingProps {
  /** What this surface is a curation OF. e.g. "Top 20 by trade volume",
   *  "recent activity (last 30 days)", "cards in your tier band". */
  what: string;
  /** Deep link to the raw substrate. The alien (or human power-user)
   *  follows this to escape the curation entirely. */
  substrateHref: string;
  /** Optional one-line reason naming the curation's selection rule.
   *  e.g. "The curation chose recent over comprehensive." */
  reason?: React.ReactNode;
  /** Compact mode renders inline with smaller text; default is block. */
  compact?: boolean;
}

export function Withholding({ what, substrateHref, reason, compact }: WithholdingProps) {
  if (compact) {
    return (
      <span
        role="note"
        aria-label={`Curation: ${what}`}
        className="inline-flex items-baseline gap-1 text-[11px] text-ink-faint italic"
      >
        <span aria-hidden="true">⊏</span>
        <span className="text-ink-muted">{what}</span>
        <span className="text-ink-faint"> — one framing; </span>
        <a
          href={substrateHref}
          className="text-accent hover:text-accent-strong not-italic"
        >
          substrate
        </a>
      </span>
    );
  }
  return (
    <div
      role="note"
      aria-label={`Curation: ${what}`}
      className="rounded-md border border-border-subtle bg-surface-subtle px-3 py-2 text-[11px] text-ink-faint"
    >
      <div className="flex items-baseline gap-2 flex-wrap">
        <span aria-hidden="true" className="text-ink-faint">⊏</span>
        <span className="uppercase tracking-wider text-ink-faint">curation</span>
        <span className="text-ink-muted">{what}</span>
      </div>
      {reason && (
        <div className="mt-1 italic text-ink-faint leading-relaxed">{reason}</div>
      )}
      <div className="mt-1">
        <span className="text-ink-faint">Raw substrate: </span>
        <a
          href={substrateHref}
          className="text-accent hover:text-accent-strong not-italic font-mono"
        >
          {substrateHref}
        </a>
      </div>
    </div>
  );
}
