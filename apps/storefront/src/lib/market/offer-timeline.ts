// Shared offer timeline. Same shape as the dispute, verification,
// and auction-fulfilment timelines: an explicit per-status step map
// so a new state can't silently regress the UI.
//
// Three steps cover the negotiation arc:
//
//   1. Offered     — buyer made the offer; awaiting seller
//   2. Responded   — seller engaged (countered) but not yet resolved
//   3. Resolved    — terminal state (accepted/declined/expired/withdrawn)
//
// 'accepted' and 'declined' jump straight from offered to resolved
// (skipping responded) because the seller's first response IS the
// resolution. 'countered' parks on responded until the buyer either
// acceptCounters (→ resolved) or declines.

export type OfferStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "countered"
  | "expired"
  | "withdrawn";

export const OFFER_STEPS = ["offered", "responded", "resolved"] as const;
export type OfferStep = (typeof OFFER_STEPS)[number];

const STATUS_TO_STEP: Record<OfferStatus, OfferStep> = {
  pending: "offered",
  countered: "responded",
  accepted: "resolved",
  declined: "resolved",
  expired: "resolved",
  withdrawn: "resolved",
};

export function getOfferStep(status: OfferStatus): OfferStep {
  return STATUS_TO_STEP[status];
}

const TERMINAL: ReadonlySet<OfferStatus> = new Set([
  "accepted", "declined", "expired", "withdrawn",
]);

export function isOfferTerminal(status: OfferStatus): boolean {
  return TERMINAL.has(status);
}

// Whose turn is it — drives the action buttons in the UI.
//   pending   → seller (must accept/decline/counter)
//   countered → buyer  (must accept counter or decline)
//   resolved  → null   (no further action)
export function getOfferActor(status: OfferStatus): "seller" | "buyer" | null {
  if (status === "pending") return "seller";
  if (status === "countered") return "buyer";
  return null;
}
