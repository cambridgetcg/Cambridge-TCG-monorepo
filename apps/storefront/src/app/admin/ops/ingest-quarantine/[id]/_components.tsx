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
        <p className="text-sm text-ink-muted">
          This row is already reviewed.{" "}
          {currentResolution && (
            <>
              Resolution: <span className="font-mono text-accent-strong">{currentResolution}</span>.
            </>
          )}
        </p>
        <button
          type="button"
          onClick={reopen}
          disabled={pending}
          className="text-xs px-3 py-1.5 bg-surface-elevated text-ink-muted hover:bg-neutral-700 border border-border-strong rounded transition disabled:opacity-50"
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
            <span className="text-sm text-ink-muted">
              <span className="font-mono text-accent-strong">{opt.value}</span>
              {" — "}
              <span className="text-ink-muted">{opt.label.split(" — ")[1]}</span>
            </span>
          </label>
        ))}
      </div>

      <div>
        <label className="block text-xs text-ink-faint uppercase tracking-wide mb-1">
          Note (optional)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why this resolution? (logged to admin_actions_log)"
          className="w-full bg-page border border-border-subtle rounded p-2 text-sm text-ink placeholder-neutral-600 focus:border-accent focus:outline-none"
          rows={2}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="text-sm px-4 py-2 bg-accent/15 text-accent-strong border border-accent/30 rounded hover:bg-accent/25 transition disabled:opacity-50"
        >
          {pending ? "Marking resolved…" : `Mark ${resolution}`}
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}
