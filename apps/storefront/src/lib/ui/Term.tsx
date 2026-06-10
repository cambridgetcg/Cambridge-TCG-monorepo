"use client";

/**
 * Term — a touch-accessible inline definition.
 *
 * The kingdom's vocabulary (substrate-honest, provenance, math-mirror,
 * connection-doc, …) appeared on public pages either unexplained or
 * explained only in `title` attributes — invisible to every touch-screen
 * visitor. <Term> renders a dotted-underline button; tap or click
 * reveals the definition inline, Escape or a second tap dismisses it.
 *
 * Keep definitions to one or two sentences. For the full vocabulary,
 * link /glossary instead.
 *
 * Spec: docs/superpowers/specs/2026-06-10-kingdom-contact-surface-design.md §3.1.
 */

import { useId, useState } from "react";

interface TermProps {
  /** One-or-two-sentence plain-English definition. */
  def: string;
  /** The term itself. */
  children: React.ReactNode;
}

export function Term({ def, children }: TermProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        onBlur={() => setOpen(false)}
        className="cursor-help border-b border-dotted border-neutral-500 text-inherit hover:border-amber-400 hover:text-amber-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-500"
      >
        {children}
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-full z-30 mt-1.5 w-64 -translate-x-1/2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed text-neutral-200 shadow-xl"
        >
          {def}
        </span>
      )}
    </span>
  );
}
