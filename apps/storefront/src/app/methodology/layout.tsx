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
import QuestReadSentinel from "@/components/quests/QuestReadSentinel";

export const metadata: Metadata = {
  title: { template: "%s — Methodology · Cambridge TCG", default: "Methodology · Cambridge TCG" },
  description: "How Cambridge TCG decides about you — formulas, source code, and changelogs.",
};

export default function MethodologyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-950">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link
          href="/methodology"
          className="inline-block text-xs text-neutral-500 hover:text-amber-400 mb-6 transition uppercase tracking-wider"
        >
          ← All methodology pages
        </Link>
        <article className="prose prose-invert max-w-none prose-headings:text-white prose-p:text-neutral-300 prose-li:text-neutral-300 prose-strong:text-white prose-a:text-amber-400 hover:prose-a:text-amber-300 prose-code:text-amber-300 prose-code:bg-neutral-900 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[0.85em] prose-code:font-mono">
          {children}
        </article>
        {/* Quest "rule-reader": completes when the END of any individual
            /methodology/* page is reached (sentinel renders only on
            sub-pages, never on the index; solemn pages render nothing —
            the component checks isSolemnPath itself). */}
        <QuestReadSentinel
          quest="rule-reader"
          label="I read this rule"
          requirePathStartsWith="/methodology/"
        />
      </div>
    </div>
  );
}
