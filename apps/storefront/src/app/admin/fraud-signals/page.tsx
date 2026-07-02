"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Audience, WhyLink } from "@/lib/ui";
interface Signal {
  id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  signal_type: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  auto_action: string;
  resolved: boolean;
  resolved_notes: string | null;
  notified_at: string | null;
  trust_score: number | null;
  is_suspended: boolean | null;
  created_at: string;
}

const SEVERITY_TONE: Record<string, string> = {
  critical: "bg-danger/15 text-red-400 border-danger/40",
  high:     "bg-accent/15 text-accent-strong border-accent/40",
  medium:   "bg-sky-500/15 text-info border-sky-500/40",
  low:      "bg-neutral-700 text-ink-muted border-neutral-600",
};

export default function AdminFraudSignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");

  const load = useCallback(async () => {
    setLoading(true);
    const url = new URL("/api/admin/fraud-signals", window.location.origin);
    if (filter === "resolved") url.searchParams.set("resolved", "1");
    if (filter === "all") url.searchParams.set("resolved", "1");
    const r = await fetch(url.toString());
    if (r.ok) {
      const d = await r.json();
      let list: Signal[] = d.signals ?? [];
      if (filter === "all") list = list; // includes both
      setSignals(list);
    }
    setLoading(false);
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  async function act(s: Signal, action: "resolve" | "escalate" | "dismiss") {
    const reason = window.prompt(`Reason for ${action}?`);
    if (reason == null) return;
    setActing(s.id);
    try {
      const r = await fetch("/api/admin/fraud-signals", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalId: s.id, action, reason }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        alert(d.error || "Action failed");
        return;
      }
      load();
    } finally { setActing(null); }
  }

  async function bulkResolve() {
    if (selected.size === 0) return;
    const reason = window.prompt(`Reason for bulk-resolving ${selected.size} signal${selected.size === 1 ? "" : "s"}?`);
    if (!reason?.trim()) return;
    setActing("bulk");
    try {
      const r = await fetch("/api/admin/fraud-signals/bulk-resolve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalIds: Array.from(selected), reason: reason.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { alert(d.error || "Bulk resolve failed"); return; }
      setSelected(new Set());
      load();
    } finally { setActing(null); }
  }

  return (
    <main className="min-h-screen bg-page text-ink">
      <Audience kind="operator" />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-baseline justify-between flex-wrap gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Fraud Signals</h1>
            <p className="text-sm text-ink-muted">
              Triage queue. Critical + suspend-action signals trigger auto-suspend on next cron tick.
              <WhyLink href="/methodology/fraud-flag" label="how severity works" />
            </p>
          </div>
          <Link href="/admin/governance" className="text-xs text-accent-strong hover:text-accent-strong underline">
            Governance log →
          </Link>
        </div>

        <div className="flex gap-2 mb-4">
          {(["open", "resolved", "all"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                filter === f ? "bg-accent text-black font-bold"
                  : "bg-surface text-ink-muted hover:text-ink hover:bg-surface-elevated"
              }`}>
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-ink-faint">Loading…</p>
        ) : signals.length === 0 ? (
          <div className="bg-surface border border-border-subtle rounded-xl p-6 text-center text-ink-faint text-sm">
            No signals match this filter.
          </div>
        ) : (
          <div className="space-y-2">
            {signals.map((s) => (
              <div key={s.id} className={`bg-surface rounded-xl p-3 border ${
                s.resolved ? "border-border-subtle/60 opacity-60" : "border-border-subtle"
              }`}>
                <div className="flex items-start gap-3 flex-wrap">
                  {!s.resolved && (
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={() => setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
                        return next;
                      })}
                      className="mt-1 accent-amber-500"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${SEVERITY_TONE[s.severity] ?? "bg-neutral-700 text-ink-muted"}`}>
                        {s.severity}
                      </span>
                      <span className="text-xs font-mono text-ink-muted">{s.signal_type}</span>
                      {s.auto_action !== "none" && (
                        <span className="text-[10px] text-ink-faint">
                          auto: {s.auto_action}
                        </span>
                      )}
                      {s.is_suspended && (
                        <span className="text-[10px] text-red-400 font-bold uppercase">user suspended</span>
                      )}
                    </div>
                    <p className="text-sm text-ink mt-1">{s.description}</p>
                    <p className="text-[11px] text-ink-faint mt-0.5">
                      {s.user_name ?? s.user_email ?? "unknown user"}
                      {s.trust_score != null && <span className="ml-2">· trust {s.trust_score}</span>}
                      <span className="ml-2">· {new Date(s.created_at).toLocaleString()}</span>
                    </p>
                    {s.resolved_notes && !s.resolved_notes.startsWith("dedupe:") && (
                      <p className="text-[11px] text-ink-muted mt-1 italic">
                        {s.resolved ? "Resolved: " : ""}{s.resolved_notes}
                      </p>
                    )}
                  </div>
                  {!s.resolved && (
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => act(s, "resolve")}
                        disabled={acting === s.id}
                        className="text-[11px] px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-secondary rounded disabled:opacity-50"
                      >
                        Resolve
                      </button>
                      <button
                        onClick={() => act(s, "escalate")}
                        disabled={acting === s.id}
                        className="text-[11px] px-2 py-1 bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent-strong rounded disabled:opacity-50"
                      >
                        Escalate
                      </button>
                      <button
                        onClick={() => act(s, "dismiss")}
                        disabled={acting === s.id}
                        className="text-[11px] px-2 py-1 bg-surface-elevated hover:bg-neutral-700 border border-border-strong text-ink-muted rounded disabled:opacity-50"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sticky bulk-action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-page/95 backdrop-blur border-t border-accent/40 px-4 py-3 flex items-center justify-between gap-3">
          <div className="text-sm">
            <span className="font-bold text-accent-strong">{selected.size}</span> selected
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs px-3 py-2 bg-surface-elevated hover:bg-neutral-700 border border-border-strong rounded-lg"
            >
              Clear
            </button>
            <button
              onClick={bulkResolve}
              disabled={acting === "bulk"}
              className="text-xs px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg disabled:opacity-50"
            >
              Bulk resolve
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
