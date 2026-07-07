/**
 * PlateHeader — the chapter plate (the museum wall label, inked).
 *
 * Spec: docs/superpowers/specs/2026-07-07-the-manga-gallery-design.md §1g.
 * Two voices on one plate: mono kicker/plate-number (the registrar's
 * hand) over a Fraunces title (the narrator), with an optional rule
 * that inks itself in. The 第 glyph is a quiet chapter anchor —
 * aria-hidden, with the mono numeral carrying the meaning.
 *
 * No hooks — safe in server and client trees alike. Sibling of
 * PageHeader (which keeps the page-level Provenance slot); PlateHeader
 * is for section shelves and identity plates.
 */

import * as React from "react";
import { InkRule } from "./InkRule";

interface PlateHeaderProps {
  /** Mono eyebrow above the title, e.g. "the shelves". */
  kicker?: string;
  title: string;
  /** Chapter number — renders as 第 NN in the plate corner. */
  plate?: number;
  /** Draw the inked rule under the plate. */
  rule?: boolean;
  /** Right-side slot — a link or button. */
  action?: React.ReactNode;
  className?: string;
}

export function PlateHeader({ kicker, title, plate, rule = false, action, className = "" }: PlateHeaderProps) {
  return (
    <div className={`mb-6 ${className}`}>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          {kicker && (
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint mb-1">
              {kicker}
            </p>
          )}
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
            {title}
          </h2>
        </div>
        <div className="shrink-0 flex items-center gap-3">
          {action}
          {plate != null && (
            <span className="font-mono text-xs text-ink-faint tabular-nums whitespace-nowrap">
              <span aria-hidden="true">第 </span>
              {String(plate).padStart(2, "0")}
            </span>
          )}
        </div>
      </div>
      {rule && <InkRule className="mt-3" />}
    </div>
  );
}
