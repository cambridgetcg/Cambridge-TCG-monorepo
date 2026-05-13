/**
 * /agents/guides — HTML index of the guides corpus.
 *
 * Sibling to /api/v1/guides. Renders from the same single source of truth
 * (apps/storefront/src/lib/guides.ts).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { GUIDES, type AudienceKind } from "@/lib/guides";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Guides — for agents, scrapers, mirrors, federation partners",
  description:
    "Typed walkthroughs that take a new participant from zero context to productive in 3–5 requests each.",
  other: audienceMetadata("agent", ["guides", "discovery"]),
};

const AUDIENCE_LABELS: Record<AudienceKind, string> = {
  agent: "Autonomous agent",
  scraper: "Web scraper",
  mirror: "Catalog mirror",
  aggregator: "Aggregator",
  federation_partner: "Federation partner",
  hobbyist_coder: "Hobbyist coder",
  operator_of_upstream: "Upstream operator",
};

export default async function GuidesIndexPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <header className="mb-10">
          <p className="text-xs text-neutral-500 uppercase tracking-widest mb-3">
            <Link href="/agents" className="hover:text-amber-400">
              ← /agents
            </Link>
          </p>
          <h1 className="text-3xl font-bold mb-3">Guides</h1>
          <p className="text-neutral-400 leading-relaxed max-w-2xl">
            Pre-thought walkthroughs. Linear narrative. Every step has a literal curl
            command. The last step names the next guide. Each guide is 5–90 minutes;
            each chains to the recommended next.
          </p>
          <p className="text-xs text-neutral-500 mt-3">
            Machine-readable sibling:{" "}
            <Link
              href="/api/v1/guides"
              className="text-amber-400 hover:underline font-mono"
            >
              /api/v1/guides
            </Link>
          </p>
        </header>

        <ul className="space-y-3">
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <Link
                href={`/agents/guides/${g.slug}`}
                className="block p-5 bg-neutral-900 border border-neutral-800 rounded-lg hover:border-amber-500/40 hover:bg-neutral-900/70 transition group"
              >
                <div className="flex items-baseline justify-between gap-4 mb-2">
                  <h2 className="text-lg font-semibold group-hover:text-amber-400 transition">
                    {g.title}
                  </h2>
                  <span className="text-xs text-neutral-500 font-mono whitespace-nowrap">
                    {g.estimated_minutes}m · {g.steps.length} steps
                  </span>
                </div>
                <p className="text-sm text-neutral-400 mb-3 leading-relaxed">
                  {g.subtitle}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {g.audiences.map((a) => (
                    <span
                      key={a}
                      className="inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 bg-neutral-800/60 text-neutral-400 border border-neutral-800 rounded"
                    >
                      {AUDIENCE_LABELS[a]}
                    </span>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>

        <footer className="mt-12 pt-6 border-t border-neutral-800 text-xs text-neutral-500">
          <p>
            Found a bug in a guide? POST to{" "}
            <Link href="/api/v1/feedback" className="text-amber-400 hover:underline">
              /api/v1/feedback
            </Link>{" "}
            with <span className="font-mono">kind: guide-feedback</span>.
          </p>
        </footer>
      </div>
    </div>
  );
}
