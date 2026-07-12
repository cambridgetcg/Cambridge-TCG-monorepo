"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import { Audience } from "@/lib/ui";

interface FeedbackRow {
  feedback_id: string;
  kind: string;
  reporter_contact: string | null;
  raw_body: Record<string, unknown>;
  status: string;
  received_at: string;
  notes: string | null;
  commit_sha: string | null;
  content_expires_at: string | null;
  content_redacted_at: string | null;
  lifecycle_expires_at: string | null;
}

interface Payload {
  feedback: FeedbackRow[];
  counts: Record<string, number>;
}

export default function AdminFeedbackPage() {
  const [filter, setFilter] = useState("open");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/feedback?status=${encodeURIComponent(filter)}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setData(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Feedback inbox is unavailable.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  async function update(row: FeedbackRow, status: "triaged" | "patched" | "wont-fix") {
    let notes = "";
    let commitSha = "";
    if (status === "patched") {
      commitSha = window.prompt("Commit SHA for the fix:")?.trim() ?? "";
      if (!commitSha) return;
      notes = window.prompt("Optional note:")?.trim() ?? "";
    } else if (status === "wont-fix") {
      notes = window.prompt("Why is this being closed without a change?")?.trim() ?? "";
      if (!notes) return;
    } else {
      notes = window.prompt("Optional triage note:")?.trim() ?? "";
    }

    setBusy(row.feedback_id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/feedback/${row.feedback_id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, notes, commit_sha: commitSha || undefined }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Update failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminShell
      title="Feedback & corrections"
      subtitle="Private operator inbox. Message content and contact details are removed automatically after the stated retention window."
      actions={
        <button onClick={() => void load()} disabled={loading} className="px-4 py-2 bg-neutral-800 text-sm rounded-lg hover:bg-neutral-700 disabled:opacity-50">
          {loading ? "Loading…" : "Refresh"}
        </button>
      }
    >
      <Audience kind="operator" />
      {error && <div className="mb-4 rounded-lg border border-red-700/40 bg-red-900/30 px-4 py-3 text-sm text-red-300">{error}</div>}

      <div className="mb-5 flex flex-wrap gap-2">
        {["open", "received", "triaged", "patched", "wont-fix", "all"].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`rounded-full px-3 py-1.5 text-xs ${filter === status ? "bg-amber-500 text-black" : "bg-neutral-900 text-neutral-400 hover:text-white"}`}
          >
            {status} {data?.counts[status] !== undefined ? `(${data.counts[status]})` : ""}
          </button>
        ))}
      </div>

      {!loading && data?.feedback.length === 0 && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-center text-sm text-neutral-500">No feedback matches this view.</div>
      )}

      <div className="space-y-3">
        {data?.feedback.map((row) => (
          <article key={row.feedback_id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <code className="text-xs font-semibold text-amber-400">{row.feedback_id}</code>
                <span className="ml-2 text-xs text-neutral-500">{row.kind} · {row.status}</span>
              </div>
              <time className="text-xs text-neutral-600">{new Date(row.received_at).toLocaleString()}</time>
            </div>
            {row.reporter_contact && <p className="mt-2 break-all text-sm text-neutral-300">Reply contact: {row.reporter_contact}</p>}
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-neutral-950 p-3 text-xs text-neutral-300">{JSON.stringify(row.raw_body, null, 2)}</pre>
            {row.notes && <p className="mt-2 text-xs text-neutral-400">Note: {row.notes}</p>}
            <p className="mt-2 text-[11px] text-neutral-600">
              {row.content_redacted_at ? `Personal content removed ${new Date(row.content_redacted_at).toLocaleString()}.` : row.content_expires_at ? `Personal content expires ${new Date(row.content_expires_at).toLocaleString()}.` : "Retention deadline unavailable until migration 0119 is applied."}
              {row.lifecycle_expires_at ? ` Lifecycle row deletes ${new Date(row.lifecycle_expires_at).toLocaleString()}.` : ""}
            </p>
            {row.status !== "patched" && row.status !== "wont-fix" && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button disabled={busy === row.feedback_id} onClick={() => void update(row, "triaged")} className="rounded bg-neutral-800 px-3 py-1.5 text-xs hover:bg-neutral-700 disabled:opacity-40">Mark triaged</button>
                <button disabled={busy === row.feedback_id} onClick={() => void update(row, "patched")} className="rounded bg-emerald-500/20 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-40">Close as patched</button>
                <button disabled={busy === row.feedback_id} onClick={() => void update(row, "wont-fix")} className="rounded bg-red-500/15 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/25 disabled:opacity-40">Close without change</button>
              </div>
            )}
          </article>
        ))}
      </div>
    </AdminShell>
  );
}
