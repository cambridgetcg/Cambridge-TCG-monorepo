"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import Link from "next/link";

import { Audience } from "@/lib/ui";
interface Event {
  kind: string;
  summary: string;
  at: string;
  link: string | null;
  group: string;
  tone: string;
  isAdminOnly?: boolean;
}

const TONE_DOT: Record<string, string> = {
  emerald: "bg-emerald-400",
  amber:   "bg-accent-strong",
  red:     "bg-red-400",
  sky:     "bg-sky-400",
  fuchsia: "bg-fuchsia-400",
  default: "bg-neutral-600",
};

export default function AdminUserJourneyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/users/${id}/journey`)
      .then((r) => r.json())
      .then((d) => setEvents(d?.events ?? []))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <main className="min-h-screen bg-page text-ink">
      <Audience kind="operator" />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-baseline justify-between flex-wrap gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold">User Journey</h1>
            <p className="text-sm text-ink-muted">
              Forensic timeline — full event log with no privacy filter.
            </p>
            <p className="text-[11px] text-neutral-600 font-mono mt-1">{id}</p>
          </div>
          <div className="flex gap-3 text-xs">
            <Link href="/admin/governance" className="text-accent-strong hover:text-accent-strong underline">Governance →</Link>
            <Link href="/admin/fraud-signals" className="text-accent-strong hover:text-accent-strong underline">Fraud →</Link>
          </div>
        </div>

        {loading ? (
          <p className="text-ink-faint">Loading…</p>
        ) : events.length === 0 ? (
          <div className="bg-surface border border-border-subtle rounded-xl p-6 text-center text-ink-faint text-sm">
            No events for this user.
          </div>
        ) : (
          <ol className="relative border-l border-border-subtle ml-3 space-y-2">
            {events.map((e, i) => {
              const dot = TONE_DOT[e.tone] ?? TONE_DOT.default;
              return (
                <li key={`${e.kind}-${i}`} className="ml-4 relative">
                  <span className={`absolute -left-[22px] top-3 w-2 h-2 rounded-full ${dot}`} />
                  <div className="rounded-xl border border-border-subtle bg-surface p-3">
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <p className="text-sm text-ink">
                        {e.summary}
                        {e.isAdminOnly && (
                          <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-elevated text-ink-muted">
                            admin-only
                          </span>
                        )}
                      </p>
                      <span className="text-[11px] text-ink-faint whitespace-nowrap">
                        {new Date(e.at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-[10px] text-ink-faint mt-1 font-mono">{e.kind}</p>
                    {e.link && (
                      <Link href={e.link} className="text-[11px] text-accent-strong hover:text-accent-strong underline mt-1 inline-block">
                        View →
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </main>
  );
}
