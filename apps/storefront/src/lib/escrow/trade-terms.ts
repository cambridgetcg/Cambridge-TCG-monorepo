// Honest, snapshot-sourced escrow explainer for a single trade.
//
// Every trade row snapshots its own escrow terms at match time
// (escrow_tier, seller_ships_to, requires_photos, dispute_window_hours,
// payout_hold_days, accepts_returns, return_window_days) precisely so a
// later change to the seller's trust tier can't rewrite what THIS trade
// promised. The /account/trades/[id] page previously rendered its
// explainer from /api/escrow/routing, which RE-DERIVES the tier from the
// seller's CURRENT trust — so a full-escrow, 168h/5-day trade was shown
// to its own seller as "Direct Ship, 48h, 7-day hold". This module reads
// only the stored snapshot, and branches the wording on the viewer's role
// so neither party is handed the other's instructions.
//
// Pure + client-importable (no server/db imports) so the client bundle
// and the vitest suite share one source of truth.

import type { EscrowTier } from "@/lib/escrow/service-tiers";

export type TradeRole = "buyer" | "seller";

export interface StoredTradeTerms {
  escrow_tier: EscrowTier;
  seller_ships_to?: string | null; // 'ctcg' | 'buyer'
  requires_photos?: boolean | null;
  dispute_window_hours?: number | null;
  payout_hold_days?: number | null;
  accepts_returns?: boolean | null;
  return_window_days?: number | null;
}

// The one-line badge headline, branched by role. Full-escrow (ships to
// Cambridge TCG) reads differently from direct/verified (ships to buyer).
export function tierHeadline(terms: StoredTradeTerms, role: TradeRole): string {
  const viaCtcg = terms.escrow_tier === "full_escrow" || terms.seller_ships_to === "ctcg";
  if (viaCtcg) {
    return role === "seller"
      ? "You ship to Cambridge TCG — we inspect, then forward to the buyer"
      : "Ships through Cambridge TCG — we inspect, then forward it to you";
  }
  if (terms.escrow_tier === "verified") {
    return role === "seller"
      ? "Photo-verified — you ship directly to the buyer once photos clear"
      : "Photo-verified — the seller ships directly to you once photos clear";
  }
  return role === "seller"
    ? "Direct ship — you ship directly to the buyer"
    : "Direct ship — the seller ships directly to you";
}

// Format an hour window as the friendliest honest unit: whole days when
// it divides evenly, otherwise raw hours. Never rounds — a 168h window is
// "7 days", a 50h window stays "50h".
function windowLabel(hours: number): string {
  if (hours > 0 && hours % 24 === 0) {
    const days = hours / 24;
    return `${days}-day`;
  }
  return `${hours}h`;
}

// The explainer bullets, every value read from the trade's own snapshot,
// branched by viewer role. Returned as plain strings so the caller owns
// all styling.
export function buildTradeTermBullets(terms: StoredTradeTerms, role: TradeRole): string[] {
  const bullets: string[] = [];
  const viaCtcg = terms.escrow_tier === "full_escrow" || terms.seller_ships_to === "ctcg";

  // 1. Shipping route
  if (viaCtcg) {
    bullets.push(
      role === "seller"
        ? "Ship the card to Cambridge TCG first — we inspect it, then forward it to the buyer."
        : "The seller ships to Cambridge TCG first; we inspect, then forward it to you.",
    );
  } else {
    bullets.push(
      role === "seller"
        ? "Ship directly to the buyer at the address below."
        : "The seller ships directly to you.",
    );
  }

  // 2. Photos (only when this trade actually requires them)
  if (terms.requires_photos) {
    bullets.push(
      role === "seller"
        ? "Upload clear photos of the card before you ship."
        : "The seller uploads photos of the card before shipping.",
    );
  }

  // 3. Dispute window — from the stored snapshot, never recomputed.
  if (terms.dispute_window_hours != null && terms.dispute_window_hours > 0) {
    bullets.push(
      `${windowLabel(terms.dispute_window_hours)} dispute window after delivery.`,
    );
  }

  // 4. Payout hold — from the stored snapshot.
  if (terms.payout_hold_days != null) {
    if (terms.payout_hold_days <= 0) {
      bullets.push(
        role === "seller"
          ? "Your payout is released as soon as the trade completes."
          : "The seller's payout is released as soon as the trade completes.",
      );
    } else {
      const d = terms.payout_hold_days;
      const unit = `${d} day${d === 1 ? "" : "s"}`;
      bullets.push(
        role === "seller"
          ? `Your payout is released ${unit} after the trade completes.`
          : `The seller's payout is held ${unit} after the trade completes.`,
      );
    }
  }

  // 5. Returns — honest either way so a buyer knows before shipping starts.
  if (terms.accepts_returns) {
    const w = terms.return_window_days ?? 14;
    bullets.push(`Returns accepted within ${w} day${w === 1 ? "" : "s"} of delivery.`);
  } else {
    bullets.push("No returns on this trade.");
  }

  return bullets;
}
