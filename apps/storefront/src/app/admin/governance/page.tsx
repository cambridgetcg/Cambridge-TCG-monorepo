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
  "user.suspend":         "text-red-400 border-red-500/40",
  "user.auto_suspend":    "text-red-400 border-red-500/40",
  "user.unsuspend":       "text-emerald-400 border-emerald-500/40",
  "user.trust_override":  "text-amber-400 border-amber-500/40",
  "fraud.resolve":        "text-emerald-400 border-emerald-500/40",
  "fraud.escalate":       "text-amber-400 border-amber-500/40",
  "fraud.dismiss":        "text-neutral-400 border-neutral-700",
  "review.hide":          "text-amber-400 border-amber-500/40",
  "review.unhide":        "text-emerald-400 border-emerald-500/40",
  "dispute.force_resolve":"text-amber-400 border-amber-500/40",
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
    <main className="min-h-screen bg-neutral-950 text-white">
      <Audience kind="operator" />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-baseline justify-between flex-wrap gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Governance Log</h1>
            <p className="text-sm text-neutral-400">
              Every consequential admin or system action — append-only, with before/after diff.
            </p>
          </div>
          <Link href="/admin/fraud-signals" className="text-xs text-amber-400 hover:text-amber-300 underline">
            Fraud queue →
          </Link>
        </div>

        <div className="flex gap-2 mb-4">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by user_id (UUID) — leave blank for all"
            className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-amber-500"
          />
          <button
            onClick={load}
            className="px-4 py-2 bg-amber-500 text-black font-bold rounded-lg text-sm"
          >
            Apply
          </button>
        </div>

        {loading ? (
          <p className="text-neutral-500">Loading…</p>
        ) : entries.length === 0 ? (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-center text-neutral-500 text-sm">
            No governance entries match.
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((e) => (
              <article key={e.id} className={`bg-neutral-900 rounded-xl p-4 border ${ACTION_TONE[e.action] ?? "border-neutral-800"}`}>
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div className="font-mono text-sm">
                    <span className={ACTION_TONE[e.action]?.split(" ")[0] ?? "text-neutral-300"}>
                      {e.action}
                    </span>
                    <span className="text-xs text-neutral-500 ml-2">
                      {e.target_kind}:{e.target_id?.slice(0, 8) ?? "—"}
                    </span>
                  </div>
                  <span className="text-xs text-neutral-500">
                    {new Date(e.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  by {e.actor_label ?? "(unknown)"}
                  {e.reason && <span className="text-neutral-300"> · {e.reason}</span>}
                </p>
                {(e.before_value || e.after_value) && (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <pre className="bg-red-500/5 border border-red-500/20 rounded p-2 overflow-x-auto text-neutral-400">
                      {e.before_value ? JSON.stringify(e.before_value, null, 2) : "(no before)"}
                    </pre>
                    <pre className="bg-emerald-500/5 border border-emerald-500/20 rounded p-2 overflow-x-auto text-neutral-400">
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
