"use client";

import { useState, useTransition } from "react";
import { resolveQuarantine, reopenQuarantine } from "./_actions";

const RESOLUTION_OPTIONS = [
  { value: "reprocess", label: "Reprocess — re-enter the pipeline at Stage 2 once the normalizer is fixed" },
  { value: "manual-fix", label: "Manual fix — operator entered the corrected row directly" },
  { value: "upstream-bug", label: "Upstream bug — the upstream's data is wrong; flag and move on" },
  { value: "discard", label: "Discard — not worth fixing; this row is dropped" },
];

export function ResolutionForm({
  id,
  currentResolution,
  isReviewed,
}: {
  id: number;
  currentResolution: string | null;
  isReviewed: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<string>(currentResolution ?? "reprocess");
  const [note, setNote] = useState<string>("");

  function submit() {
    setError(null);
    start(async () => {
      const result = await resolveQuarantine({ id, resolution, note });
      if (!result.ok) {
        setError(result.error);
      } else {
        // Page revalidation handled by adminAction's revalidate option
      }
    });
  }

  function reopen() {
    setError(null);
    start(async () => {
      const result = await reopenQuarantine({ id });
      if (!result.ok) setError(result.error);
    });
  }

  if (isReviewed) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-neutral-300">
          This row is already reviewed.{" "}
          {currentResolution && (
            <>
              Resolution: <span className="font-mono text-amber-400">{currentResolution}</span>.
            </>
          )}
        </p>
        <button
          type="button"
          onClick={reopen}
          disabled={pending}
          className="text-xs px-3 py-1.5 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 border border-neutral-700 rounded transition disabled:opacity-50"
        >
          {pending ? "Reopening…" : "Reopen for re-review"}
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {RESOLUTION_OPTIONS.map((opt) => (
          <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="resolution"
              value={opt.value}
              checked={resolution === opt.value}
              onChange={(e) => setResolution(e.target.value)}
              className="mt-1"
            />
            <span className="text-sm text-neutral-300">
              <span className="font-mono text-amber-400">{opt.value}</span>
              {" — "}
              <span className="text-neutral-400">{opt.label.split(" — ")[1]}</span>
            </span>
          </label>
        ))}
      </div>

      <div>
        <label className="block text-xs text-neutral-500 uppercase tracking-wide mb-1">
          Note (optional)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why this resolution? (logged to admin_actions_log)"
          className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-sm text-neutral-200 placeholder-neutral-600 focus:border-amber-500 focus:outline-none"
          rows={2}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="text-sm px-4 py-2 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded hover:bg-amber-500/25 transition disabled:opacity-50"
        >
          {pending ? "Marking resolved…" : `Mark ${resolution}`}
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}
