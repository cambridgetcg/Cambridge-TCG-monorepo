// Trade-cancellation handshake timeline. Same shape as the
// offer-timeline / return-timeline modules: explicit STATUS → STEP
// map so a new state can't silently regress the UI's progress bar.

export type CancelStatus =
  | "requested"
  | "approved"
  | "declined"
  | "expired"
  | "withdrawn";

export const CANCEL_STEPS = ["requested", "responded"] as const;
export type CancelStep = (typeof CANCEL_STEPS)[number];

const STATUS_TO_STEP: Record<CancelStatus, CancelStep | null> = {
  requested: "requested",
  approved: "responded",
  // declined / expired / withdrawn are off-path: the handshake
  // resolved without the trade being cancelled. UI shows a closed-
  // state visual instead of advancing the bar.
  declined: null,
  expired: null,
  withdrawn: null,
};

export function getCancelStep(status: CancelStatus): CancelStep | null {
  return STATUS_TO_STEP[status];
}

const TERMINAL: ReadonlySet<CancelStatus> = new Set([
  "approved", "declined", "expired", "withdrawn",
]);

export function isCancelTerminal(status: CancelStatus): boolean {
  return TERMINAL.has(status);
}

// Whose turn — drives action buttons.
//   requested → "other" (the non-requester approves/declines)
//   any terminal → null
export function getCancelActor(status: CancelStatus): "other" | null {
  return status === "requested" ? "other" : null;
}

export function getCancelClosedCopy(status: CancelStatus): string | null {
  switch (status) {
    case "declined":  return "Other party declined the cancel request.";
    case "withdrawn": return "Cancel request was withdrawn.";
    case "expired":   return "Cancel request expired without a response — trade continues to its payment window.";
    case "approved":  return null;  // on-path; timeline carries it
    default:          return null;
  }
}

// Reasons the requester can pick. Loose taxonomy; "other" requires
// a free-text message (lib-enforced). UI offers chips.
export const CANCEL_REASONS = [
  { value: "wrong_price",      label: "Wrong price (listing error)" },
  { value: "wrong_card",       label: "Wrong card / SKU mismatch" },
  { value: "wrong_qty",        label: "Wrong quantity" },
  { value: "listing_error",    label: "Listing error (other)" },
  { value: "can_not_pay",      label: "Can no longer pay" },
  { value: "no_longer_needed", label: "No longer needed" },
  { value: "other",            label: "Other (explain)" },
] as const;

export type CancelReason = (typeof CANCEL_REASONS)[number]["value"];
