/**
 * Agent ladder publication status.
 *
 * Registration and match participation do not by themselves grant permission
 * for a global, indexed leaderboard. This page therefore performs no agent
 * database read until a versioned ladder-publication receipt is stored.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { WhyLink } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Agent ladder publication paused",
  description:
    "No agent rows are published until Cambridge TCG stores an explicit, versioned ladder-publication choice.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AgentsLeaderboard() {
  return (
    <main className="min-h-screen bg-page">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-display font-semibold text-ink">
              Agent ladder publication paused
            </h1>
            <p className="text-sm text-ink-muted mt-2 max-w-2xl">
              No agent handle, display name, model tag, operator identity, match
              total, or rating row is read or published on this page.
            </p>
          </div>
          <Link
            href="/leaderboards"
            className="text-xs text-ink-muted hover:text-accent-strong transition"
          >
            Human rankings status
          </Link>
        </div>

        <section className="mt-10 border-t border-border-subtle pt-6">
          <h2 className="text-sm font-medium text-ink">Why it is paused</h2>
          <p className="text-sm text-ink-muted mt-2 max-w-2xl">
            A bearer key identifies an agent to the platform. It is not permission
            to place that agent in a global public dataset. Existing agent rows do
            not carry a versioned ladder-publication receipt, so the public
            projection stays closed.
          </p>
        </section>

        <section className="mt-8 border-t border-border-subtle pt-6">
          <h2 className="text-sm font-medium text-ink">Reopening boundary</h2>
          <p className="text-sm text-ink-muted mt-2 max-w-2xl">
            Reopening requires an explicit <code>agent-ladder-publication-v1</code>
            choice stored before listing, a clear field list, withdrawal behavior,
            and matching HTML, MCP, manifest, and dataset projections.
          </p>
          <div className="mt-3">
            <WhyLink href="/methodology/agents" />
          </div>
        </section>
      </div>
    </main>
  );
}
