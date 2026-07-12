"use client";

import { useState } from "react";

export default function ReviewActions({
  sourceId,
  reviewId,
  state,
  isLeaf,
  blockedReason,
}: {
  sourceId: string;
  reviewId: string;
  state: string;
  isLeaf: boolean;
  blockedReason: string | null;
}) {
  const [commit, setCommit] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function transition(action: "submit" | "reject" | "mark-landed") {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/source-rights/${sourceId}/proposals/${reviewId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          landed_commit: action === "mark-landed" ? commit : undefined,
          rejection_reason: action === "reject" ? rejectionReason : undefined,
        }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Transition failed.");
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Transition failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <a href={`/api/admin/source-rights/${sourceId}/proposals/${reviewId}/export`} className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500">Export</a>
      {isLeaf && state === "draft" && <button disabled={pending || Boolean(blockedReason)} onClick={() => transition("submit")} className={buttonClass}>Submit for review</button>}
      {isLeaf && (state === "draft" || state === "proposed") && (
        <>
          <input value={rejectionReason} maxLength={1000} onChange={(e) => setRejectionReason(e.target.value)} className="w-80 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs" placeholder="Reason required to reject" />
          <button disabled={pending || !rejectionReason.trim()} onClick={() => transition("reject")} className={buttonClass}>Reject</button>
        </>
      )}
      {isLeaf && state === "proposed" && (
        <>
          <input value={commit} onChange={(e) => setCommit(e.target.value)} className="w-80 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 font-mono text-xs" placeholder="Observed deployed commit (40 lowercase hex)" />
          <button disabled={pending || Boolean(blockedReason) || !/^[0-9a-f]{40}$/.test(commit)} onClick={() => transition("mark-landed")} className={buttonClass}>Record operator-asserted landed observation</button>
        </>
      )}
      {isLeaf && blockedReason && <span className="basis-full text-xs text-amber-300">{blockedReason}</span>}
      {error && <span className="text-xs text-red-300">{error}</span>}
    </div>
  );
}

const buttonClass = "rounded border border-amber-700/60 bg-amber-950/30 px-2 py-1 text-xs text-amber-200 hover:border-amber-500 disabled:opacity-40";
