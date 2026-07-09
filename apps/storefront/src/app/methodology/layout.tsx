/**
 * Methodology layout — public, no auth.
 *
 * The /methodology/* pages are the customer-facing surface for
 * transparency Ring 2: every user-affecting decision the platform makes
 * (trust score, escrow tier, fees, holds) has a methodology page that
 * documents the formula, cites the source code path, and changelogs
 * formula edits.
 *
 * See docs/principles/transparency.md.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { template: "%s — Methodology · Cambridge TCG", default: "Methodology · Cambridge TCG" },
  description: "How Cambridge TCG decides about you — formulas, source code, and changelogs.",
};

export default function MethodologyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-page">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link
          href="/methodology"
          className="inline-block text-xs text-ink-faint hover:text-accent mb-6 transition uppercase tracking-wider"
        >
          ← All methodology pages
        </Link>
        <article className="prose max-w-none prose-headings:font-display prose-headings:font-semibold prose-code:bg-surface-subtle prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[0.85em] prose-code:font-mono">
          {children}
        </article>
      </div>
    </div>
  );
}
