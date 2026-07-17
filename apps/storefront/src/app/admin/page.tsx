"use client";

// Admin overview hub. Fetches /api/admin/overview on mount and surfaces
// the outstanding count for each queue as a card. Pure navigation —
// mutations live on each destination page.

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";

import { Audience } from "@/lib/ui";
interface Queues {
  redemptionsPending: number;
  auctionsLive: number;
  verificationsPending: number;
  payoutsPending: number;
  disputesOpen: number;
  fraudOpen: number;
  emailsDead: number;
}

export default function AdminHome() {
  const [queues, setQueues] = useState<Queues | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/overview", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setQueues(d?.queues ?? null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminShell
      title="Overview"
      subtitle="Everything that needs a human. Counts update on reload."
      actions={
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-neutral-800 text-sm rounded-lg hover:bg-neutral-700 transition"
        >
      <Audience kind="operator" />
          Refresh
        </button>
      }
    >
      {/* Ops — fulfil orders + bounty redemptions */}
      <Section label="Ops" hint="Day-to-day fulfilment">
        <QueueCard
          href="/admin/bounty/redemptions"
          title="Redemptions"
          stats={[{ label: "Pending", value: queues?.redemptionsPending, tone: queues?.redemptionsPending ? "amber" : "default" }]}
          loading={loading}
        />
        <QueueCard
          href="/admin/auctions"
          title="Auctions"
          stats={[{ label: "Live", value: queues?.auctionsLive }]}
          loading={loading}
        />
        <QueueCard
          href="/admin/verifications"
          title="Verifications"
          stats={[{ label: "Pending", value: queues?.verificationsPending, tone: queues?.verificationsPending ? "amber" : "default" }]}
          loading={loading}
        />
      </Section>

      {/* Money — anything that pays cash in or out */}
      <Section label="Money" hint="Payouts, disputes, fraud">
        <QueueCard
          href="/admin/payouts"
          title="Payouts"
          stats={[{ label: "On hold", value: queues?.payoutsPending, tone: queues?.payoutsPending ? "amber" : "default" }]}
          loading={loading}
        />
        <QueueCard
          href="/admin/disputes"
          title="Disputes"
          stats={[{ label: "Open", value: queues?.disputesOpen, tone: queues?.disputesOpen ? "red" : "default" }]}
          loading={loading}
        />
        <QueueCard
          href="/admin/fraud"
          title="Fraud"
          stats={[{ label: "Unresolved", value: queues?.fraudOpen, tone: queues?.fraudOpen ? "red" : "default" }]}
          loading={loading}
        />
      </Section>

      {/* Content — catalog, rewards, configuration */}
      <Section label="Content" hint="Catalog, rewards, config">
        <QueueCard href="/admin/rewards" title="Rewards" stats={[]} loading={loading} />
        <QueueCard href="/admin/bounty/pull-tiers" title="Pull Tiers" stats={[]} loading={loading} />
        <QueueCard href="/admin/bounty/grants" title="Token Grants" stats={[]} loading={loading} />
        <QueueCard href="/admin/market" title="Market" stats={[]} loading={loading} />
        <QueueCard href="/admin/tiers" title="Tiers" stats={[]} loading={loading} />
      </Section>

      {/* System — meta dashboards */}
      <Section label="System" hint="Operational health">
        <QueueCard
          href="/admin/emails"
          title="Email Queue"
          stats={[{ label: "Dead", value: queues?.emailsDead, tone: queues?.emailsDead ? "red" : "default" }]}
          loading={loading}
        />
        <QueueCard href="/admin/og" title="OG Cards" stats={[]} loading={loading} />
      </Section>
    </AdminShell>
  );
}

function Section({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="flex items-baseline gap-3 mb-3">
        <h2 className="text-sm font-bold text-white uppercase tracking-wide">{label}</h2>
        <span className="text-xs text-neutral-600">{hint}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {children}
      </div>
    </section>
  );
}

type Tone = "default" | "amber" | "emerald" | "red";
interface Stat { label: string; value: number | undefined; tone?: Tone }

function QueueCard({
  href,
  title,
  stats,
  loading,
}: {
  href: string;
  title: string;
  stats: Stat[];
  loading: boolean;
}) {
  return (
    <Link
      href={href}
      className="bg-neutral-900 hover:bg-neutral-900/60 border border-neutral-800 hover:border-neutral-700 rounded-xl p-4 transition group"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-white group-hover:text-amber-400 transition">{title}</span>
        <span className="text-neutral-700 group-hover:text-amber-400 transition text-sm">→</span>
      </div>
      {stats.length === 0 ? (
        <p className="text-xs text-neutral-600">Open the page to manage.</p>
      ) : (
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="text-[10px] uppercase tracking-wide text-neutral-600">{s.label}</p>
              <p className={`text-xl font-bold tabular-nums ${toneClass(s.tone)}`}>
                {loading ? <span className="text-neutral-700">–</span> : (s.value ?? 0)}
              </p>
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}

function toneClass(t: Tone | undefined): string {
  switch (t) {
    case "amber":   return "text-amber-400";
    case "emerald": return "text-emerald-400";
    case "red":     return "text-red-400";
    default:        return "text-white";
  }
}
