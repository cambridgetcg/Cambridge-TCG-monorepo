"use client";

/**
 * Client-side action triggers for /trust/disputes.
 *
 * Lives next to page.tsx as `_components.tsx` (the underscore prefix keeps
 * it out of the route table) — see CLAUDE.md "File layout per module".
 */

import { useTransition, useState } from "react";
import { transitionDispute } from "./_actions";

const TRANSITION_LABELS: Record<string, string> = {
  under_review:      "Start review",
  awaiting_evidence: "Request evidence",
  resolved_buyer:    "Resolve for buyer",
  resolved_seller:   "Resolve for seller",
  resolved_split:    "Resolve as split",
  closed:            "Close",
};

const NEXT_STEPS: Record<string, string[]> = {
  open:               ["under_review", "awaiting_evidence", "closed"],
  under_review:       ["awaiting_evidence", "resolved_buyer", "resolved_seller", "resolved_split", "closed"],
  awaiting_evidence:  ["under_review", "resolved_buyer", "resolved_seller", "resolved_split", "closed"],
  resolved_buyer:     ["closed"],
  resolved_seller:    ["closed"],
  resolved_split:     ["closed"],
  closed:             [],
};

interface TransitionButtonProps {
  dispute: { id: string; status: string };
}

export function TransitionButton({ dispute }: TransitionButtonProps) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const next = NEXT_STEPS[dispute.status] ?? [];
  if (next.length === 0) {
    return <span className="text-xs text-neutral-600">terminal</span>;
  }

  function trigger(to: string) {
    const reason = window.prompt(
      `Reason for "${TRANSITION_LABELS[to] ?? to}"?\n(Logged to governance audit.)`,
    );
    if (!reason) return;
    setOpen(false);
    startTransition(async () => {
      const result = await transitionDispute({ id: dispute.id, to, reason });
      if (!result.ok) window.alert(result.error);
    });
  }

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className="text-xs px-2 py-1 border border-neutral-700 rounded text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
      >
        {pending ? "…" : "Action ▾"}
      </button>
      {open && (
        <div
          className="absolute right-0 z-10 mt-1 w-44 rounded-md border border-neutral-700 bg-neutral-900 py-1 shadow-xl"
          onMouseLeave={() => setOpen(false)}
        >
          {next.map((to) => (
            <button
              key={to}
              type="button"
              onClick={() => trigger(to)}
              className="block w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
            >
              {TRANSITION_LABELS[to] ?? to}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
