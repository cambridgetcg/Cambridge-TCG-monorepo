"use client";

import { useActionState } from "react";
import {
  resolveCoverageHuntAction,
  type ResolutionActionState,
} from "./_actions";

const INITIAL: ResolutionActionState = { ok: false, message: "" };

export default function ResolutionForm({ caseId }: { caseId: string }) {
  const [state, action, pending] = useActionState(resolveCoverageHuntAction, INITIAL);
  return (
    <form action={action} className="mt-4 space-y-3 border-t border-neutral-800 pt-4">
      <input type="hidden" name="case_id" value={caseId} />
      <label className="block text-xs font-medium uppercase tracking-wide text-neutral-400">
        Resolution
        <select name="resolution" required defaultValue="" className="mt-1 block w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white">
          <option value="" disabled>Choose…</option>
          <option value="accept_as_gap">Accept as a documented gap</option>
          <option value="accept_as_correction_candidate">Accept as a correction candidate</option>
          <option value="reject">Reject</option>
          <option value="duplicate">Duplicate</option>
        </select>
      </label>
      <label className="block text-xs font-medium uppercase tracking-wide text-neutral-400">
        Human review reason
        <textarea name="reason" required minLength={1} maxLength={2000} rows={3} className="mt-1 block w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm normal-case tracking-normal text-white" placeholder="What the three turns support, and what remains unknown." />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50">
          {pending ? "Recording…" : "Record review only"}
        </button>
        <span className="text-xs text-neutral-500">No apply action exists.</span>
      </div>
      {state.message && <p role="status" className={`text-sm ${state.ok ? "text-emerald-400" : "text-red-400"}`}>{state.message}</p>}
    </form>
  );
}
