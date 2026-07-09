// Escrow timeline resolution for the P2P marketplace.
//
// Each tier (direct / verified / full_escrow) has its own linear chain
// of visible stages. This module is the single source of truth for:
//   - The ordered step labels shown to the user
//   - Which escrow_status maps to which step index per tier
//
// Previously the /account/trades/[id] page inferred active step via
// fragile string matching (`s.includes("inspect")`), which silently
// mispositioned `received_by_ctcg`, `verified`, and `completed` for
// full_escrow tier. This replacement uses an explicit table so every
// status has exactly one defined step and a regression is loud.

import type { EscrowStatus } from "@/lib/market/types";
import type { EscrowTier } from "@/lib/escrow/service-tiers";

// "Delivered" used to be a step no actor could ever set — the platform
// sees confirmations, not deliveries (lib/shipping/carriers.ts). The
// buyer-bound leg now resolves via the buyer's confirm-receipt button or
// the auto-complete sweep when the dispute window lapses
// (lib/market/completion.ts), so the step is named for what actually
// moves it: "Confirm Receipt".
export const TIMELINE_STEPS: Record<EscrowTier, string[]> = {
  direct: ["Paid", "Seller Ships", "Confirm Receipt", "Dispute Window", "Payout"],
  verified: ["Paid", "Photos Uploaded", "CTCG Reviews", "Seller Ships", "Confirm Receipt", "Payout"],
  full_escrow: ["Paid", "Seller Ships to CTCG", "CTCG Inspects", "CTCG Ships to Buyer", "Payout"],
};

// Step index resolution per tier. Only values listed here render as
// "progress"; anything else (disputed/refunded/cancelled — terminal
// failure states) stays on step 0 so the UI can show an off-ramp
// instead of a misleading step.
//
// Step index is the *furthest done step* — i.e. at step N, steps
// 0..N-1 are complete and step N is the current/next step in flight.
// This matches the getActiveStep contract the page already renders
// against, so no rendering change is required.
const STATUS_STEP: Record<EscrowTier, Partial<Record<EscrowStatus, number>>> = {
  direct: {
    awaiting_payment: 0,
    paid: 1,                // Paid → Seller Ships (next)
    awaiting_shipment: 1,
    shipped_to_buyer: 2,    // Confirm Receipt (buyer confirms, or the
                            // window lapses and the sweep completes it)
    verified: 3,            // Dispute Window (post-delivery hold)
    completed: 4,           // Payout done
  },
  verified: {
    awaiting_payment: 0,
    paid: 1,
    shipped_to_ctcg: 2,     // Photos uploaded → CTCG Reviews
    received_by_ctcg: 2,
    verified: 3,            // Seller Ships (photos approved, ship to buyer)
    shipped_to_buyer: 4,    // Confirm Receipt (buyer confirm / auto window)
    completed: 5,           // Payout
  },
  full_escrow: {
    awaiting_payment: 0,
    paid: 1,                // Paid → Seller Ships to CTCG
    awaiting_shipment: 1,
    shipped_to_ctcg: 2,     // CTCG Inspects (arriving at our hub)
    received_by_ctcg: 2,
    verified: 3,            // CTCG Ships to Buyer
    shipped_to_buyer: 4,    // Payout (out the door)
    completed: 4,           // Payout
  },
};

/**
 * Resolve the active (furthest-done) timeline step for a given trade.
 *
 * @param tier - The escrow routing tier the trade uses.
 * @param status - The current escrow_status on the trade row.
 * @returns Step index in [0, TIMELINE_STEPS[tier].length - 1].
 */
export function getActiveStep(tier: EscrowTier, status: EscrowStatus | string | null | undefined): number {
  if (!status) return 0;
  // Narrow the lookup — unknown status or terminal failure states fall
  // back to 0 so the timeline doesn't wrongly claim progress.
  const tierMap = STATUS_STEP[tier];
  const step = tierMap[status as EscrowStatus];
  return step ?? 0;
}
