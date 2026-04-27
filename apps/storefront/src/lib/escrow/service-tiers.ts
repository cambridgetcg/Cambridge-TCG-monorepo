// Tiered Escrow Service Model
//
// Tier 1: Direct Ship     (£0 — £30)    Seller → Buyer directly
// Tier 2: Verified Ship   (£30 — £150)  Seller uploads photos → CTCG reviews → Seller → Buyer
// Tier 3: Full Escrow     (£150+)       Seller → CTCG → Inspect → Buyer
//
// Trust overrides adjust thresholds:
// - Elite (95+): direct up to £500
// - New (0-19): full escrow on everything over £15
// - Flagged: full escrow always

import { query } from "@/lib/db";
import { TRUST_TIERS } from "./types";

export type EscrowTier = "direct" | "verified" | "full_escrow";

export interface EscrowRouting {
  tier: EscrowTier;
  label: string;
  description: string;
  requiresPhotos: boolean;
  requiresTracking: boolean;
  requiresInsurance: boolean;
  requiresInspection: boolean;
  payoutHoldDays: number;
  disputeWindowHours: number;
  sellerShipsTo: "buyer" | "ctcg";
  estimatedDays: string;
}

// Categories that ALWAYS require full escrow regardless of value
const ALWAYS_INSPECT_RARITIES = new Set(["PSA", "BGS", "CGC"]); // Graded slabs
const ALWAYS_INSPECT_KEYWORDS = ["graded", "psa", "bgs", "cgc", "sealed", "box", "booster"];

// ── Determine escrow tier for a trade ──

export async function routeTrade(data: {
  tradeValue: number;
  sellerTrustScore: number;
  buyerTrustScore: number;
  sellerIsFlagged: boolean;
  buyerIsFlagged: boolean;
  cardName?: string;
  rarity?: string;
  condition?: string;
}): Promise<EscrowRouting> {
  const value = data.tradeValue;
  const sellerScore = data.sellerTrustScore;
  const lowerScore = Math.min(sellerScore, data.buyerTrustScore);

  // ── Always-inspect check ──
  const nameLC = (data.cardName || "").toLowerCase();
  const rarityLC = (data.rarity || "").toUpperCase();
  const isAlwaysInspect =
    ALWAYS_INSPECT_RARITIES.has(rarityLC) ||
    ALWAYS_INSPECT_KEYWORDS.some(kw => nameLC.includes(kw));

  if (isAlwaysInspect) {
    return fullEscrow(sellerScore);
  }

  // ── Flagged accounts → full escrow always ──
  if (data.sellerIsFlagged || data.buyerIsFlagged) {
    return fullEscrow(sellerScore);
  }

  // ── Trust-adjusted thresholds ──
  const { directMax, verifiedMax } = getThresholds(lowerScore);

  if (value <= directMax) {
    return directShip(sellerScore, lowerScore);
  }

  if (value <= verifiedMax) {
    return verifiedShip(sellerScore);
  }

  return fullEscrow(sellerScore);
}

// ── Threshold calculation by trust ──

function getThresholds(trustScore: number): { directMax: number; verifiedMax: number } {
  // Elite (95+): direct up to £500, verified up to £1000
  if (trustScore >= 95) return { directMax: 500, verifiedMax: 1000 };

  // Veteran (80-94): direct up to £100, verified up to £300
  if (trustScore >= 80) return { directMax: 100, verifiedMax: 300 };

  // Trusted (50-79): direct up to £50, verified up to £200
  if (trustScore >= 50) return { directMax: 50, verifiedMax: 200 };

  // Starter (20-49): direct up to £30, verified up to £150
  if (trustScore >= 20) return { directMax: 30, verifiedMax: 150 };

  // New (0-19): direct up to £15, everything else full escrow
  return { directMax: 15, verifiedMax: 15 };
}

// ── Tier definitions ──

// Combine routing-tier hold with trust-tier hold (from trust-engine).
// We want the MORE CONSERVATIVE (longer) of the two: a New-tier seller
// matched into Direct Ship still serves their full New-tier hold; an
// Elite seller in Full Escrow still gets the routing-tier minimum.
//
// Without this both systems disagreed: service-tiers said "direct ship
// for a Veteran = 0 hold days" while trust-engine said "Veteran = 1
// hold day". The longer hold is the safer policy.
function reconcileHold(routingHold: number, sellerScore: number): number {
  // Lazy-import via require shape avoids a circular: trust-engine ->
  // service-tiers (via routeTrade) -> trust-engine. Inline the same
  // tier table to keep this synchronous and dep-free.
  const trustHold =
    sellerScore >= 95 ? 0
    : sellerScore >= 80 ? 1
    : sellerScore >= 50 ? 3
    : sellerScore >= 20 ? 5
    : 7;
  return Math.max(routingHold, trustHold);
}

function directShip(sellerScore: number, lowerScore: number): EscrowRouting {
  const routingHold = lowerScore >= 80 ? 0 : lowerScore >= 50 ? 1 : 3;
  return {
    tier: "direct",
    label: "Direct Ship",
    description: "Seller ships directly to buyer. Fastest delivery.",
    requiresPhotos: sellerScore < 50, // New/starter sellers must upload photos
    requiresTracking: true,
    requiresInsurance: false,
    requiresInspection: false,
    payoutHoldDays: reconcileHold(routingHold, sellerScore),
    disputeWindowHours: 48,
    sellerShipsTo: "buyer",
    estimatedDays: "2-4 days",
  };
}

function verifiedShip(sellerScore: number): EscrowRouting {
  const routingHold = sellerScore >= 80 ? 1 : sellerScore >= 50 ? 3 : 5;
  return {
    tier: "verified",
    label: "Verified Ship",
    description: "Seller uploads card photos for CTCG review, then ships directly to buyer.",
    requiresPhotos: true,
    requiresTracking: true,
    requiresInsurance: true,
    requiresInspection: false, // Photo review only, not physical
    payoutHoldDays: reconcileHold(routingHold, sellerScore),
    disputeWindowHours: 72,
    sellerShipsTo: "buyer",
    estimatedDays: "3-5 days",
  };
}

function fullEscrow(sellerScore: number): EscrowRouting {
  const routingHold = sellerScore >= 80 ? 1 : sellerScore >= 50 ? 3 : 5;
  return {
    tier: "full_escrow",
    label: "Full Escrow",
    description: "Seller ships to Cambridge TCG. We inspect, verify, and forward to buyer.",
    requiresPhotos: true,
    requiresTracking: true,
    requiresInsurance: true,
    requiresInspection: true,
    payoutHoldDays: reconcileHold(routingHold, sellerScore),
    disputeWindowHours: 168, // 7 days
    sellerShipsTo: "ctcg",
    estimatedDays: "5-8 days",
  };
}

// ── Route a specific trade by ID ──

export async function getTradeRouting(tradeId: string): Promise<EscrowRouting | null> {
  const result = await query(
    `SELECT t.price, t.buyer_id, t.seller_id,
       bu.trust_score as buyer_trust, su.trust_score as seller_trust,
       bp.is_flagged as buyer_flagged, sp.is_flagged as seller_flagged,
       o.card_name, o.condition
     FROM market_trades t
     JOIN users bu ON t.buyer_id=bu.id
     JOIN users su ON t.seller_id=su.id
     LEFT JOIN trust_profiles bp ON bp.user_id=t.buyer_id
     LEFT JOIN trust_profiles sp ON sp.user_id=t.seller_id
     LEFT JOIN market_orders o ON t.bid_order_id=o.id
     WHERE t.id=$1`,
    [tradeId]
  );

  if (result.rows.length === 0) return null;
  const t = result.rows[0];

  return routeTrade({
    tradeValue: parseFloat(t.price),
    sellerTrustScore: t.seller_trust || 0,
    buyerTrustScore: t.buyer_trust || 0,
    sellerIsFlagged: t.seller_flagged || false,
    buyerIsFlagged: t.buyer_flagged || false,
    cardName: t.card_name,
    condition: t.condition,
  });
}

// ── Summary for display ──

export function getEscrowSummary(routing: EscrowRouting): string[] {
  const points: string[] = [];

  if (routing.tier === "direct") {
    points.push("Seller ships directly to you");
    points.push(`Estimated delivery: ${routing.estimatedDays}`);
    if (routing.requiresPhotos) points.push("Seller must upload card photos before shipping");
    points.push("Tracked shipping required");
    points.push(`${routing.disputeWindowHours}h dispute window after delivery`);
  } else if (routing.tier === "verified") {
    points.push("Seller uploads photos → CTCG reviews → Seller ships to you");
    points.push(`Estimated delivery: ${routing.estimatedDays}`);
    points.push("Tracked + insured shipping required");
    points.push(`${routing.disputeWindowHours}h dispute window after delivery`);
  } else {
    points.push("Seller ships to Cambridge TCG → We inspect & verify → Ship to you");
    points.push(`Estimated delivery: ${routing.estimatedDays}`);
    points.push("Card authenticated and condition verified by CTCG");
    points.push("Tracked + insured shipping both legs");
  }

  if (routing.payoutHoldDays > 0) {
    points.push(`Seller payout held ${routing.payoutHoldDays} day${routing.payoutHoldDays > 1 ? "s" : ""} after delivery`);
  } else {
    points.push("Instant seller payout on delivery confirmation");
  }

  return points;
}

// ── Thresholds for display (what the user sees) ──

export function getUserThresholds(trustScore: number): {
  directMax: number;
  verifiedMax: number;
  trustTier: string;
} {
  const thresholds = getThresholds(trustScore);
  const tier = [...TRUST_TIERS].reverse().find(t => trustScore >= t.minScore) || TRUST_TIERS[0];
  return { ...thresholds, trustTier: tier.name };
}
