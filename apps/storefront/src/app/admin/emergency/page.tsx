"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface EmergencyEntry {
  id: number;
  actor_label: string | null;
  target_user_id: string | null;
  action: string;
  reason: string | null;
  created_at: string;
}

interface ActionResult {
  ok: boolean;
  changed: boolean;
  message: string;
}

export default function AdminEmergencyPage() {
  const [mode, setMode] = useState<"freeze" | "lift">("freeze");
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const [acknowledge, setAcknowledge] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ActionResult | { ok: false; message: string } | null>(null);
  const [log, setLog] = useState<EmergencyEntry[]>([]);

  const loadLog = useCallback(async () => {
    const res = await fetch("/api/admin/emergency").then((r) => r.json()).catch(() => null);
    if (res?.entries) setLog(res.entries);
  }, []);

  useEffect(() => {
    loadLog();
  }, [loadLog]);

  const canSubmit =
    userId.trim().length > 0 &&
    reason.trim().length >= 20 &&
    (mode === "lift" || acknowledge) &&
    !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/emergency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: mode,
          userId: userId.trim(),
          reason: reason.trim(),
          acknowledge: mode === "freeze" ? acknowledge : undefined,
        }),
      });
      const data = await res.json();
      setResult(data);
      if (data.ok) {
        setReason("");
        setAcknowledge(false);
        loadLog();
      }
    } catch {
      setResult({ ok: false, message: "Request failed." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-red-400">Emergency intervention</h1>

      {/* The bar for using this at all. */}
      <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm leading-relaxed text-neutral-200">
        <p className="font-semibold text-red-300">This is a break-glass. It is the only way to freeze an account, and it is for existential emergencies only.</p>
        <p className="mt-2">
          Cambridge TCG does not police people — there is no routine suspension, no
          automatic punishment, no &ldquo;abuse&rdquo; enforcement. Escrow protects every
          trade, so ordinary bad behaviour needs no ban.
        </p>
        <p className="mt-2">
          Use this <em>only</em> for a genuine platform-integrity emergency: an active
          exploit draining the platform, a compromised account attacking others, a
          systemic fraud threatening everyone at once — the kind of event where a chain
          hard-forks to undo a hack. <strong className="text-red-300">Not</strong> for rude
          messages, lowball offers, cancellations, returns, or disputes. For anything less
          than existential, the answer is escrow, disputes, and a human conversation.
        </p>
        <p className="mt-2 text-neutral-400">
          A freeze is a hold, not a verdict: it pauses the account (hides listings, blocks
          new trades) but never deletes, seizes, or punishes. Every freeze and every lift is
          logged below with your identity and your reason.
        </p>
      </div>

      <div className="mt-6 flex gap-2">
        <button
          onClick={() => { setMode("freeze"); setResult(null); }}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${mode === "freeze" ? "bg-red-500/20 text-red-300 border border-red-500/50" : "bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-neutral-200"}`}
        >
          Freeze an account
        </button>
        <button
          onClick={() => { setMode("lift"); setResult(null); }}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${mode === "lift" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50" : "bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-neutral-200"}`}
        >
          Lift a freeze
        </button>
      </div>

      <div className="mt-4 space-y-4 rounded-lg border border-neutral-700 bg-neutral-900 p-4">
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">Target account id</span>
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="the user's UUID"
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Written justification (required, min 20 chars — this is recorded)
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="What is the emergency? What harm is happening right now, and why is a freeze the proportionate response?"
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
          />
          <span className="mt-1 block text-xs text-neutral-500">{reason.trim().length}/20</span>
        </label>

        {mode === "freeze" && (
          <label className="flex items-start gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={acknowledge}
              onChange={(e) => setAcknowledge(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I confirm this is a genuine platform-integrity emergency, not routine
              moderation, and that this action is logged and will be reviewed.
            </span>
          </label>
        )}

        <button
          onClick={submit}
          disabled={!canSubmit}
          className={`rounded-lg px-5 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${mode === "freeze" ? "bg-red-500 text-white hover:bg-red-600" : "bg-emerald-500 text-white hover:bg-emerald-600"}`}
        >
          {submitting ? "Working…" : mode === "freeze" ? "Freeze this account" : "Lift the freeze"}
        </button>

        {result && (
          <p className={`text-sm ${result.ok ? "text-emerald-400" : "text-red-400"}`}>
            {result.message}
          </p>
        )}
      </div>

      {/* Transparency: the loud audit trail. */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Recent emergency actions</h2>
        {log.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">
            None on record. Good — the break-glass has never been used.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {log.map((e) => (
              <li key={e.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-mono text-xs font-semibold ${e.action === "emergency.freeze" ? "text-red-400" : "text-emerald-400"}`}>
                    {e.action}
                  </span>
                  <span className="text-xs text-neutral-500">{new Date(e.created_at).toLocaleString()}</span>
                </div>
                <p className="mt-1 text-neutral-300">
                  <span className="text-neutral-500">by</span> {e.actor_label ?? "unknown"}{" "}
                  <span className="text-neutral-500">on</span>{" "}
                  <span className="font-mono text-xs">{e.target_user_id ?? "—"}</span>
                </p>
                {e.reason && <p className="mt-1 text-neutral-400">{e.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-6 text-xs text-neutral-500">
        How the platform treats enforcement in general:{" "}
        <Link href="/methodology/fraud-flag" className="underline hover:text-neutral-300">
          /methodology/fraud-flag
        </Link>
        .
      </p>
    </div>
  );
}
