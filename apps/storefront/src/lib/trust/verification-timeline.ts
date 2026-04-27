// Verification lifecycle timeline — the user-facing /account/verify
// page and the admin /admin/verifications view read from this module
// so the two always render the same step positions.
//
// Simple lifecycle:
//   Submitted → Reviewing → Verified OR Rejected
//
// 'Reviewing' lights the moment status=pending, visually distinct from
// 'Submitted' only in that the admin has *not yet* acted (there is no
// separate under_review stamp — admin's next action is verify/reject,
// and we don't bother with a middle "someone's looking at it now"
// state because it adds noise without meaningfully changing behaviour).
// We still render it as a step so the bar doesn't jump.

import type { VerificationStatus } from "@/lib/trust/types";

export interface VerificationStep {
  key: string;
  label: string;
  /** Column whose non-null timestamp lights this step. */
  tsField: "created_at" | "updated_at" | "verified_at" | "rejected_at";
}

export const VERIFICATION_TIMELINE: VerificationStep[] = [
  { key: "submitted", label: "Submitted", tsField: "created_at" },
  { key: "reviewing", label: "Reviewing", tsField: "updated_at" },
  { key: "resolved",  label: "Resolved",  tsField: "verified_at" },
];

const STATUS_STEP: Record<VerificationStatus, number> = {
  pending: 1,
  verified: 2,
  rejected: 2,
  expired: 2,
};

export function getVerificationStep(status: VerificationStatus | string | null | undefined): number {
  if (!status) return 0;
  const s = STATUS_STEP[status as VerificationStatus];
  return s ?? 0;
}

export function isVerificationTerminal(status: VerificationStatus | string | null | undefined): boolean {
  if (!status) return false;
  return status === "verified" || status === "rejected" || status === "expired";
}

// What's the expected next action for the user given current status?
// Surfaces in the UI as the CTA text.
export function getNextActionForUser(status: VerificationStatus | string | null | undefined): string | null {
  if (!status) return "Submit for verification";
  if (status === "pending") return null; // waiting on admin
  if (status === "verified") return null;
  if (status === "rejected") return "Fix and resubmit";
  if (status === "expired") return "Re-verify";
  return null;
}
