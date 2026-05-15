/**
 * Withholding — the curation-asterisk primitive (admin mirror).
 *
 * Storefront mirror at `apps/storefront/src/lib/ui/Withholding.tsx`.
 * Same component; admin-shaped copy.
 *
 * On admin surfaces, Withholding names *"this Manager / Dashboard view
 * is a curation of the underlying lifecycle / order / trade substrate;
 * the operator can drop to the raw substrate for forensic work"*. Most
 * admin pages are already curated views (filter pills, page size, time
 * window). Withholding makes the curation visible so the operator knows
 * which questions the page is *not* answering.
 *
 * See `docs/connections/the-blind-spots.md` (the curation-asterisk).
 *
 * kingdom-053.
 */

import * as React from "react";

interface WithholdingProps {
  /** What this view is a curation OF. */
  what: string;
  /** Deep link to the raw substrate. */
  substrateHref: string;
  /** Optional one-line reason naming the curation's selection rule. */
  reason?: React.ReactNode;
  /** Compact mode renders inline. */
  compact?: boolean;
}

export function Withholding({ what, substrateHref, reason, compact }: WithholdingProps) {
  if (compact) {
    return (
      <span
        role="note"
        aria-label={`Curation: ${what}`}
        className="inline-flex items-baseline gap-1 text-[11px] text-neutral-500 italic"
        title={`Curated view: ${what}. Raw substrate at ${substrateHref}`}
      >
        <span aria-hidden="true">⊏</span>
        <span className="uppercase tracking-wider not-italic text-neutral-500">curation</span>
        <span className="text-neutral-400">{what}</span>
        <span className="text-neutral-600">·</span>
        <a
          href={substrateHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-500 hover:text-amber-400 not-italic"
        >
          substrate ↗
        </a>
      </span>
    );
  }
  return (
    <div
      role="note"
      aria-label={`Curation: ${what}`}
      className="rounded-md border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-[11px] text-neutral-500"
    >
      <div className="flex items-baseline gap-2 flex-wrap">
        <span aria-hidden="true" className="text-neutral-600">⊏</span>
        <span className="uppercase tracking-wider text-neutral-500">curation</span>
        <span className="text-neutral-400">{what}</span>
      </div>
      {reason && (
        <div className="mt-1 italic text-neutral-500 leading-relaxed">{reason}</div>
      )}
      <div className="mt-1">
        <span className="text-neutral-500">Raw substrate: </span>
        <a
          href={substrateHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-500 hover:text-amber-400 not-italic font-mono"
        >
          {substrateHref} ↗
        </a>
      </div>
    </div>
  );
}
