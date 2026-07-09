/**
 * Callout — the display vocabulary for framed asides.
 *
 * Four tones, each with a meaning the kingdom already speaks:
 * - `doctrine`  (amber)   — a doctrine epigraph or operator directive,
 *                           quoted as provenance per the creation doctrine.
 * - `note`      (neutral) — orientation for a first-time reader.
 * - `warning`   (red)     — something that will surprise you if unread.
 * - `substrate` (emerald) — a claim about how a value came to be true.
 *
 * Before this primitive, doctrine quotes and orientation asides were
 * hand-rolled blockquotes with no shared form, and operator directives
 * appeared on public pages with no framing for outside readers.
 *
 * Spec: docs/superpowers/specs/2026-06-10-kingdom-contact-surface-design.md §3.1.
 */

import * as React from "react";

export type CalloutTone = "doctrine" | "note" | "warning" | "substrate";

const TONE_CLS: Record<CalloutTone, { box: string; title: string }> = {
  doctrine: {
    box: "border-accent/30 bg-accent/5",
    title: "text-accent-strong",
  },
  note: {
    box: "border-border-subtle bg-surface-subtle",
    title: "text-ink",
  },
  warning: {
    box: "border-danger/30 bg-danger/5",
    title: "text-danger",
  },
  substrate: {
    box: "border-ok/30 bg-ok/5",
    title: "text-ok",
  },
};

interface CalloutProps {
  tone?: CalloutTone;
  title?: string;
  children: React.ReactNode;
}

export function Callout({ tone = "note", title, children }: CalloutProps) {
  const cls = TONE_CLS[tone];
  return (
    <aside
      className={`not-prose my-6 rounded-lg border px-4 py-3 text-sm leading-relaxed text-ink-muted ${cls.box}`}
    >
      {title && (
        <p
          className={`mb-1 text-xs font-semibold uppercase tracking-wider ${cls.title}`}
        >
          {title}
        </p>
      )}
      {children}
    </aside>
  );
}
