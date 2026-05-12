"use client";

/**
 * Client-side row actions for /trust/reviews.
 *
 * Three operations: hide, unhide, resolve_appeal. Available depending on
 * tab + current state. Each prompts for a reason and dispatches an
 * adminAction-wrapped server action.
 */

import { useTransition } from "react";
import { hideReview, unhideReview, resolveAppeal } from "./_actions";

interface ReviewActionsProps {
  review: {
    id: string;
    hidden: boolean;
    appealed: boolean;
  };
  tab: "flagged" | "appealed" | "hidden";
}

export function ReviewActions({ review, tab }: ReviewActionsProps) {
  const [pending, startTransition] = useTransition();

  function hide() {
    const reason = window.prompt(
      "Reason for hiding this review?\n(Logged to admin governance.)",
    );
    if (!reason) return;
    startTransition(async () => {
      const result = await hideReview({ id: review.id, reason });
      if (!result.ok) window.alert(result.error);
    });
  }

  function unhide() {
    const reason = window.prompt(
      "Reason for un-hiding this review?\n(Logged to admin governance.)",
    );
    if (!reason) return;
    startTransition(async () => {
      const result = await unhideReview({ id: review.id, reason });
      if (!result.ok) window.alert(result.error);
    });
  }

  function dismissAppeal() {
    const reason = window.prompt(
      "Reason for dismissing the appeal?\n(Logged to admin governance.)",
    );
    if (!reason) return;
    startTransition(async () => {
      const result = await resolveAppeal({ id: review.id, reason });
      if (!result.ok) window.alert(result.error);
    });
  }

  return (
    <>
      {!review.hidden && (
        <button
          type="button"
          onClick={hide}
          disabled={pending}
          className="text-[11px] px-2 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded disabled:opacity-50"
        >
          {pending ? "…" : "Hide"}
        </button>
      )}
      {review.hidden && (
        <button
          type="button"
          onClick={unhide}
          disabled={pending}
          className="text-[11px] px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded disabled:opacity-50"
        >
          {pending ? "…" : "Unhide"}
        </button>
      )}
      {tab === "appealed" && review.appealed && (
        <button
          type="button"
          onClick={dismissAppeal}
          disabled={pending}
          className="text-[11px] px-2 py-1 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 rounded disabled:opacity-50"
        >
          {pending ? "…" : "Dismiss appeal"}
        </button>
      )}
    </>
  );
}
