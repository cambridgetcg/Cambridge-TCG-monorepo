"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Audience } from "@/lib/ui";
interface Entry {
  id: number;
  actor_label: string | null;
  target_user_id: string | null;
  target_kind: string;
  target_id: string | null;
  action: string;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}

const ACTION_TONE: Record<string, string> = {
  "user.suspend":         "text-red-400 border-danger/40",
  "user.auto_suspend":    "text-red-400 border-danger/40",
  "user.unsuspend":       "text-secondary border-emerald-500/40",
  "user.trust_override":  "text-accent-strong border-accent/40",
  "fraud.resolve":        "text-secondary border-emerald-500/40",
  "fraud.escalate":       "text-accent-strong border-accent/40",
  "fraud.dismiss":        "text-ink-muted border-border-strong",
  "review.hide":          "text-accent-strong border-accent/40",
  "review.unhide":        "text-secondary border-emerald-500/40",
  "dispute.force_resolve":"text-accent-strong border-accent/40",
};

export default function AdminGovernancePage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const url = new URL("/api/admin/governance", window.location.origin);
    if (filter.trim()) url.searchParams.set("user_id", filter.trim());
    const r = await fetch(url.toString());
    if (r.ok) setEntries((await r.json()).entries ?? []);
    setLoading(false);
  }, [filter]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  return (
    <main className="min-h-screen bg-page text-ink">
      <Audience kind="operator" />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-baseline justify-between flex-wrap gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Governance Log</h1>
            <p className="text-sm text-ink-muted">
              Every consequential admin or system action — append-only, with before/after diff.
            </p>
          </div>
          <Link href="/admin/fraud-signals" className="text-xs text-accent-strong hover:text-accent-strong underline">
            Fraud queue →
          </Link>
        </div>

        <div className="flex gap-2 mb-4">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by user_id (UUID) — leave blank for all"
            className="flex-1 px-3 py-2 bg-surface border border-border-subtle rounded-lg text-ink text-sm font-mono focus:outline-none focus:border-accent"
          />
          <button
            onClick={load}
            className="px-4 py-2 bg-accent text-black font-bold rounded-lg text-sm"
          >
            Apply
          </button>
        </div>

        {loading ? (
          <p className="text-ink-faint">Loading…</p>
        ) : entries.length === 0 ? (
          <div className="bg-surface border border-border-subtle rounded-xl p-6 text-center text-ink-faint text-sm">
            No governance entries match.
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((e) => (
              <article key={e.id} className={`bg-surface rounded-xl p-4 border ${ACTION_TONE[e.action] ?? "border-border-subtle"}`}>
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div className="font-mono text-sm">
                    <span className={ACTION_TONE[e.action]?.split(" ")[0] ?? "text-ink-muted"}>
                      {e.action}
                    </span>
                    <span className="text-xs text-ink-faint ml-2">
                      {e.target_kind}:{e.target_id?.slice(0, 8) ?? "—"}
                    </span>
                  </div>
                  <span className="text-xs text-ink-faint">
                    {new Date(e.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-ink-faint mt-1">
                  by {e.actor_label ?? "(unknown)"}
                  {e.reason && <span className="text-ink-muted"> · {e.reason}</span>}
                </p>
                {(e.before_value || e.after_value) && (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <pre className="bg-danger/5 border border-danger/20 rounded p-2 overflow-x-auto text-ink-muted">
                      {e.before_value ? JSON.stringify(e.before_value, null, 2) : "(no before)"}
                    </pre>
                    <pre className="bg-emerald-500/5 border border-emerald-500/20 rounded p-2 overflow-x-auto text-ink-muted">
                      {e.after_value ? JSON.stringify(e.after_value, null, 2) : "(no after)"}
                    </pre>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
