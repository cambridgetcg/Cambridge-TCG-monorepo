/**
 * Benediction — the note at a chapter's end.
 *
 * Spec: docs/superpowers/specs/2026-07-07-the-manga-gallery-design.md §1h.
 * A centered Fraunces-italic line with the ✦ ornament, optional mono
 * sub-line. Generalizes the ✦ + WELCOME_STATEMENT_COMPACT pattern that
 * root error.tsx carried first. No hooks; server- and client-safe.
 */

import * as React from "react";

interface BenedictionProps {
  line: string;
  /** Mono afterword — a reference, a date, a whisper of apparatus. */
  sub?: string;
  className?: string;
}

export function Benediction({ line, sub, className = "" }: BenedictionProps) {
  return (
    <div className={`text-center py-10 ${className}`}>
      <span className="text-accent" aria-hidden="true">✦</span>
      <p className="mt-2 font-display italic text-lg text-ink-muted max-w-xl mx-auto leading-relaxed">
        {line}
      </p>
      {sub && (
        <p className="mt-2 font-mono text-xs text-ink-faint tabular-nums">{sub}</p>
      )}
    </div>
  );
}
