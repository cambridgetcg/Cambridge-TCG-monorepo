// Dispute lifecycle timeline — shared source of truth for the user
// view, admin view, and E2E tests. Same pattern as @/lib/escrow/timeline:
// a single per-status → step-index map, so a future status addition
// can't silently regress one surface while the others keep working.

import type { DisputeStatus } from "@/lib/trust/types";

export interface TimelineStep {
  key: string;
  label: string;
  /** Column on trade_disputes whose timestamp anchors this step. */
  tsField: "created_at" | "under_review_at" | "awaiting_evidence_at" | "resolved_at";
}

// Order matters — the UI renders left-to-right in this order and
// lights up the furthest "reached" step.
export const DISPUTE_TIMELINE: TimelineStep[] = [
  { key: "opened",            label: "Opened",            tsField: "created_at" },
  { key: "under_review",      label: "Under Review",      tsField: "under_review_at" },
  { key: "awaiting_evidence", label: "Awaiting Evidence", tsField: "awaiting_evidence_at" },
  { key: "resolved",          label: "Resolved",          tsField: "resolved_at" },
];

// Map each DisputeStatus to the step index it corresponds to. Closed
// (withdrawn) and open disputes stay at step 0; once admin takes
// action the later steps light up by their column stamp.
//
// Awaiting_evidence sits between under_review and resolved — a dispute
// can also skip it entirely (admin resolves directly from under_review)
// which the timeline handles fine because resolved only lights when
// resolved_at is set.
const STATUS_STEP: Record<DisputeStatus, number> = {
  open: 0,
  under_review: 1,
  awaiting_evidence: 2,
  resolved_buyer: 3,
  resolved_seller: 3,
  resolved_split: 3,
  closed: 0, // withdrawn — timeline collapses back to opened
};

/**
 * Highest step index the dispute has reached. Callers combine this
 * with the per-step timestamps on the row to render "done" / "current"
 * / "future" state on each step.
 */
export function getDisputeStep(status: DisputeStatus | string | null | undefined): number {
  if (!status) return 0;
  const step = STATUS_STEP[status as DisputeStatus];
  return step ?? 0;
}

// Terminal states where the timeline should show "final" instead of
// "awaiting next step" — used by the UI to skip the current-step
// pulse and say "this dispute is closed".
export function isDisputeTerminal(status: DisputeStatus | string | null | undefined): boolean {
  if (!status) return false;
  return [
    "resolved_buyer",
    "resolved_seller",
    "resolved_split",
    "closed",
  ].includes(status);
}
