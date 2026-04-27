// Shared return-request timeline. Mirrors offer-timeline.ts shape:
// explicit STATUS → STEP map so a new state can't silently regress
// the UI's progress bar.
//
// Five steps cover the no-fault return arc:
//
//   1. requested  — buyer asked for a return
//   2. accepted   — seller agreed (in flight)
//   3. shipping   — buyer dispatched the card
//   4. received   — seller confirmed receipt
//   5. refunded   — admin issued refund (terminal)
//
// Declined / expired / cancelled jump straight to a terminal "closed"
// view that's separate from this timeline — they don't fit on the
// success-path bar. The UI renders them with a different visual.

export type ReturnStatus =
  | "requested"
  | "accepted"
  | "declined"
  | "shipping"
  | "received"
  | "refunded"
  | "cancelled"
  | "expired";

export const RETURN_STEPS = [
  "requested",
  "accepted",
  "shipping",
  "received",
  "refunded",
] as const;
export type ReturnStep = (typeof RETURN_STEPS)[number];

const STATUS_TO_STEP: Record<ReturnStatus, ReturnStep | null> = {
  requested: "requested",
  accepted: "accepted",
  shipping: "shipping",
  received: "received",
  refunded: "refunded",
  // Off-path: render with a closed-state visual instead of progressing
  // the timeline bar.
  declined: null,
  cancelled: null,
  expired: null,
};

export function getReturnStep(status: ReturnStatus): ReturnStep | null {
  return STATUS_TO_STEP[status];
}

const TERMINAL: ReadonlySet<ReturnStatus> = new Set([
  "refunded", "declined", "cancelled", "expired",
]);

export function isReturnTerminal(status: ReturnStatus): boolean {
  return TERMINAL.has(status);
}

// Whose turn — drives action buttons in the UI.
//   requested → seller (accept/decline)
//   accepted  → buyer  (ship the card back)
//   shipping  → seller (confirm receipt)
//   received  → admin  (issue refund)
//   refunded  → null
//   declined/cancelled/expired → null
export function getReturnActor(status: ReturnStatus): "seller" | "buyer" | "admin" | null {
  switch (status) {
    case "requested": return "seller";
    case "accepted":  return "buyer";
    case "shipping":  return "seller";
    case "received":  return "admin";
    default: return null;
  }
}

// Off-path closed-state copy for the UI. null when the status is on
// the success path (the timeline carries the message).
export function getReturnClosedCopy(status: ReturnStatus): string | null {
  switch (status) {
    case "declined":  return "Seller declined the return request.";
    case "cancelled": return "Buyer cancelled the return request.";
    case "expired":   return "Seller didn't respond within 7 days; request expired.";
    default: return null;
  }
}
