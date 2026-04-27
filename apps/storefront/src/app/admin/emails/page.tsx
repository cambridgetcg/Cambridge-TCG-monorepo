"use client";

import { useEffect, useState, useCallback } from "react";
import AdminShell from "@/components/admin/AdminShell";

interface DeadRow {
  id: string;
  user_id: string;
  user_email: string | null;
  event: string;
  status: string;
  attempt_count: number;
  last_error: string | null;
  last_attempt_at: string | null;
  created_at: string;
  scheduled_for: string;
}

interface Payload {
  dead: DeadRow[];
  stats7d: Record<string, number>;
  byEvent7d: Array<{ event: string; n: number }>;
}

export default function AdminEmailsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/emails");
      if (!res.ok) {
        setErr(`Failed (HTTP ${res.status})`);
        return;
      }
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function mutate(id: string, action: "retry" | "dismiss") {
    if (action === "dismiss" && !confirm("Delete this row? Audit history is lost.")) return;
    setBusy(id);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/emails/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || `HTTP ${res.status}`);
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminShell
      title="Email Queue"
      subtitle="Dead-letter rows + recent activity. Retry revives a row to pending; dismiss hard-deletes."
      authProbe="/api/admin/emails"
      actions={
        <button onClick={load} disabled={loading} className="px-4 py-2 bg-neutral-800 text-sm rounded-lg hover:bg-neutral-700 transition disabled:opacity-50">
          {loading ? "Loading..." : "Refresh"}
        </button>
      }
    >
        {err && (
          <div className="mb-4 bg-red-900/30 border border-red-700/40 text-red-300 rounded-lg px-4 py-3 text-sm">
            {err}
          </div>
        )}

        {data && (
          <>
            {/* 7-day stats */}
            <section className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
              {(["pending", "sent", "cancelled", "failed", "dead"] as const).map((k) => (
                <div key={k} className="bg-neutral-900 rounded-xl p-4">
                  <p className="text-[10px] uppercase tracking-wide text-neutral-500">{k} · 7d</p>
                  <p className={`text-2xl font-bold mt-0.5 ${
                    k === "sent" ? "text-emerald-400" :
                    k === "dead" ? "text-red-400" :
                    k === "failed" ? "text-amber-400" :
                    "text-white"
                  }`}>{data.stats7d[k] ?? 0}</p>
                </div>
              ))}
            </section>

            {/* By event */}
            {data.byEvent7d.length > 0 && (
              <section className="mb-8 bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                <h2 className="text-xs font-bold uppercase tracking-wide text-neutral-500 mb-3">By event (7d)</h2>
                <div className="flex flex-wrap gap-3">
                  {data.byEvent7d.map((e) => (
                    <div key={e.event} className="text-xs">
                      <code className="text-neutral-400">{e.event}</code>
                      <span className="text-white font-semibold ml-1">· {e.n}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Dead queue */}
            <section>
              <h2 className="font-bold mb-3">
                Dead letters <span className="text-red-400">({data.dead.length})</span>
              </h2>
              {data.dead.length === 0 ? (
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-center text-neutral-500 text-sm">
                  Nothing in the dead queue. All emails are landing.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.dead.map((r) => (
                    <div
                      key={r.id}
                      className="bg-neutral-900 border border-red-900/30 rounded-xl p-4 flex flex-wrap items-start gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-xs font-bold text-red-400">{r.event}</code>
                          <span className="text-xs text-neutral-500">· {r.user_email ?? r.user_id.slice(0, 8)}</span>
                          <span className="text-[10px] text-neutral-600">
                            · {r.attempt_count} attempts
                            {r.last_attempt_at && ` · last ${new Date(r.last_attempt_at).toLocaleString()}`}
                          </span>
                        </div>
                        {r.last_error && (
                          <p className="text-xs text-red-400/80 mt-1 font-mono break-all">
                            {r.last_error}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => mutate(r.id, "retry")}
                          disabled={busy === r.id}
                          className="text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded px-3 py-1.5 transition-colors disabled:opacity-40"
                        >
                          Retry
                        </button>
                        <button
                          onClick={() => mutate(r.id, "dismiss")}
                          disabled={busy === r.id}
                          className="text-xs bg-neutral-800 hover:bg-red-900/40 text-neutral-400 hover:text-red-400 rounded px-3 py-1.5 transition-colors disabled:opacity-40"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
    </AdminShell>
  );
}
