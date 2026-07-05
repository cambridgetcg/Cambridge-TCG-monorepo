// Trade completion — the two non-admin paths that close a market trade.
//
// Until this module the only writer of escrow_status='completed' was an
// admin (the trades PATCH or dispute resolution), so every healthy trade
// stranded at shipped_to_buyer and the payout sweep (lib/payouts/sweep.ts,
// which requires completed + completed_at) never fired. Mirrors the shape
// of lib/auction/fulfilment.ts (buyerConfirmReceived): discriminated-union
// results the route handler maps into a NextResponse.
//
// Three completion paths, distinguished on market_trades.completed_via:
//   buyer_confirm — the buyer pressed "Confirm received" (confirmReceived)
//   auto_window   — the trade's dispute window lapsed with no open
//                   dispute / return / cancel (runTradeCompletionSweep)
//   admin         — the pre-existing manual override, stamped by
//                   updateEscrowStatus in lib/market/db.ts
//
// See /methodology/trade-completion for the customer-facing recipe.

import { query, transaction } from "@/lib/db";
import { routeTrade, type EscrowTier } from "@/lib/escrow/service-tiers";
import type { EscrowStatus, MarketTrade } from "./types";

export interface CompletionResult {
  ok: boolean;
  reason?: string;
  status?: number;
  trade?: MarketTrade;
}

// ── Pure rules (unit-tested in __tests__/completion.test.ts) ──

/**
 * Which escrow states a buyer may confirm receipt from.
 *
 * 'shipped_to_buyer' is the buyer-bound leg in every tier. Direct-tier
 * 'verified' is the admin-set post-delivery hold state (see the direct
 * map in lib/escrow/timeline.ts) — the card is already with the buyer,
 * so receipt confirmation is meaningful there too. In the verified and
 * full_escrow tiers 'verified' is a PRE-shipment state (photos approved /
 * inspection passed) and must not complete the trade.
 */
export function isBuyerConfirmableState(
  tier: EscrowTier | string | null,
  status: EscrowStatus | string | null,
): boolean {
  if (status === "shipped_to_buyer") return true;
  return status === "verified" && tier === "direct";
}

/**
 * When a shipped trade auto-completes if nobody acts. Pure so the API
 * annotation and the sweep share one formula: dispatch timestamp + the
 * trade's own dispute window (falling back to the tier default when the
 * row predates window stamping).
 */
export function computeAutoCompleteAt(
  shippedAt: string | Date | null | undefined,
  disputeWindowHours: number | null | undefined,
  fallbackHours: number,
): Date | null {
  if (!shippedAt) return null;
  const base = typeof shippedAt === "string" ? new Date(shippedAt) : shippedAt;
  if (Number.isNaN(base.getTime())) return null;
  const hours = disputeWindowHours ?? fallbackHours;
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

// ── Tier-default dispute windows ──
//
// service-tiers.ts is the single source of the per-tier dispute windows,
// but it exposes them only through routeTrade — not as exported constants.
// Rather than copy the numbers here (where they would drift), we ask the
// router for a canonical trade in each tier once and cache the answer.
// The probe inputs are tier selectors (trust scores / trade values), not
// user deadlines; the windows themselves come back from the engine.
let tierWindowCache: Promise<Record<EscrowTier, number>> | null = null;

export function defaultDisputeWindowHours(): Promise<Record<EscrowTier, number>> {
  if (!tierWindowCache) {
    tierWindowCache = (async () => {
      const probe = {
        sellerTrustScore: 100,
        buyerTrustScore: 100,
        sellerIsFlagged: false,
        buyerIsFlagged: false,
      };
      const [direct, verified, fullEscrow] = await Promise.all([
        // Elite pair, trivial value → direct ship.
        routeTrade({ ...probe, tradeValue: 1 }),
        // Elite pair above the direct ceiling → verified ship.
        routeTrade({ ...probe, tradeValue: 600 }),
        // Flagged seller → full escrow at any value.
        routeTrade({ ...probe, tradeValue: 1, sellerIsFlagged: true }),
      ]);
      // Loud failure if the routing thresholds ever move under these
      // probes — a silent wrong-tier answer would mis-time the sweep.
      if (direct.tier !== "direct" || verified.tier !== "verified" || fullEscrow.tier !== "full_escrow") {
        tierWindowCache = null;
        throw new Error(
          `[market/completion] tier probes resolved to ${direct.tier}/${verified.tier}/${fullEscrow.tier} — update the probes in lib/market/completion.ts to match service-tiers.ts`,
        );
      }
      return {
        direct: direct.disputeWindowHours,
        verified: verified.disputeWindowHours,
        full_escrow: fullEscrow.disputeWindowHours,
      };
    })();
  }
  return tierWindowCache;
}

// ── Shared completion side-effects ──
//
// Fire-and-forget after the row is committed: lifecycle log, emails +
// in-app notifications (both parties), trust recompute (completion lifts
// both scores — same as the auction path), and the portfolio acquire/
// realize pair. All idempotent or dedup-keyed downstream, so a crash
// between UPDATE and side-effects loses observability, never money.
function fireCompletionSideEffects(
  trade: MarketTrade,
  opts: {
    actorId?: string | null;
    actorLabel?: string | null;
    reason: string;
    metadata?: Record<string, unknown>;
  },
): void {
  void import("./lifecycle-log").then(({ logTradeTransition }) =>
    logTradeTransition({
      tradeId: trade.id,
      action: "completed",
      actorId: opts.actorId ?? null,
      actorLabel: opts.actorLabel ?? null,
      reason: opts.reason,
      metadata: opts.metadata ?? null,
    }),
  );
  void import("./db").then(({ notifyTradeStatusChange, recordCompletedTradePortfolio }) => {
    notifyTradeStatusChange(trade).catch((err) =>
      console.error("[market/completion] status notify failed:", err),
    );
    recordCompletedTradePortfolio(trade);
  });
  void import("@/lib/escrow/trust-engine").then(async ({ calculateTrustScore }) => {
    await calculateTrustScore(trade.buyer_id).catch(() => { /* ignore */ });
    await calculateTrustScore(trade.seller_id).catch(() => { /* ignore */ });
  });
}

// ── Buyer confirms receipt ──

export async function confirmReceived(tradeId: string, userId: string): Promise<CompletionResult> {
  const result = await transaction(async (q): Promise<CompletionResult> => {
    const r = await q(
      `SELECT id, buyer_id, escrow_status, escrow_tier
         FROM market_trades WHERE id = $1 FOR UPDATE`,
      [tradeId],
    );
    if (r.rows.length === 0) {
      return { ok: false, reason: "Trade not found.", status: 404 };
    }
    const t = r.rows[0];
    if (t.buyer_id !== userId) {
      return { ok: false, reason: "Only the buyer can confirm receipt.", status: 403 };
    }
    if (t.escrow_status === "completed") {
      return { ok: false, reason: "Trade is already completed.", status: 409 };
    }
    if (!isBuyerConfirmableState(t.escrow_tier, t.escrow_status)) {
      return {
        ok: false,
        reason: `Trade is '${t.escrow_status}' — receipt can be confirmed once the card has been shipped to you.`,
        status: 409,
      };
    }

    const upd = await q(
      `UPDATE market_trades
          SET escrow_status = 'completed',
              completed_at = NOW(),
              delivered_at = NOW(),
              completed_via = 'buyer_confirm',
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [tradeId],
    );
    return { ok: true, trade: upd.rows[0] as MarketTrade };
  });

  if (result.ok && result.trade) {
    fireCompletionSideEffects(result.trade, {
      actorId: userId,
      actorLabel: "user:buyer-confirm",
      reason: "Buyer confirmed receipt — escrow completed",
      metadata: { completed_via: "buyer_confirm" },
    });
  }
  return result;
}

// ── Auto-complete sweep ──
//
// Trades stuck on the buyer-bound leg past their dispute window, with no
// open dispute, return request, or cancel handshake, complete on their
// own so the seller's payout clock can start without anyone's manual
// intervention. delivered_at stays NULL here — the platform records
// confirmations, not deliveries (lib/shipping/carriers.ts), and the sweep
// has no confirmation to record.

// Stripe-adjacent rate cap, matching the payout sweep's shape. Not a
// user deadline — just bounds one cron tick's write volume.
const MAX_COMPLETIONS_PER_RUN = 100;

export interface TradeCompletionSweepResult {
  completed: number;
  failures: Array<{ id: string; error: string }>;
}

export async function runTradeCompletionSweep(): Promise<TradeCompletionSweepResult> {
  const result: TradeCompletionSweepResult = { completed: 0, failures: [] };
  const windows = await defaultDisputeWindowHours();

  // Eligibility mirrors isBuyerConfirmableState: shipped_to_buyer in any
  // tier, plus direct-tier 'verified' (post-delivery hold). The window
  // clock starts at the dispatch stamp; dispute_window_hours COALESCEs to
  // the tier default for rows that predate window stamping.
  const candidates = await query(
    `SELECT t.id
       FROM market_trades t
      WHERE (t.escrow_status = 'shipped_to_buyer'
             OR (t.escrow_status = 'verified' AND t.escrow_tier = 'direct'))
        AND COALESCE(t.shipped_to_buyer_at, t.seller_shipped_at) IS NOT NULL
        AND COALESCE(t.shipped_to_buyer_at, t.seller_shipped_at)
            + make_interval(hours => COALESCE(t.dispute_window_hours,
                CASE t.escrow_tier
                  WHEN 'direct' THEN $1
                  WHEN 'verified' THEN $2
                  ELSE $3
                END)) < NOW()
        AND NOT EXISTS (
          SELECT 1 FROM trade_disputes d
           WHERE d.trade_id = t.id
             AND d.status NOT IN ('resolved_buyer', 'resolved_seller', 'resolved_split', 'closed')
        )
        AND NOT EXISTS (
          SELECT 1 FROM market_returns r
           WHERE r.trade_id = t.id
             AND r.status NOT IN ('declined', 'cancelled', 'expired', 'refunded')
        )
        AND NOT EXISTS (
          SELECT 1 FROM market_trade_cancellations c
           WHERE c.trade_id = t.id AND c.status = 'requested'
        )
      ORDER BY COALESCE(t.shipped_to_buyer_at, t.seller_shipped_at) ASC
      LIMIT $4`,
    [windows.direct, windows.verified, windows.full_escrow, MAX_COMPLETIONS_PER_RUN],
  );

  for (const row of candidates.rows) {
    try {
      // Guarded per-row flip: a buyer confirm or a fresh dispute between
      // the candidate SELECT and this UPDATE makes it a no-op.
      const upd = await query(
        `UPDATE market_trades
            SET escrow_status = 'completed',
                completed_at = NOW(),
                completed_via = 'auto_window',
                updated_at = NOW()
          WHERE id = $1
            AND (escrow_status = 'shipped_to_buyer'
                 OR (escrow_status = 'verified' AND escrow_tier = 'direct'))
          RETURNING *`,
        [row.id],
      );
      if (upd.rows.length === 0) continue;
      const trade = upd.rows[0] as MarketTrade;
      fireCompletionSideEffects(trade, {
        actorLabel: "system:trade-completion-sweep",
        reason: "Dispute window elapsed with no open dispute, return, or cancel — auto-completed",
        metadata: {
          completed_via: "auto_window",
          dispute_window_hours: trade.dispute_window_hours,
        },
      });
      result.completed++;
    } catch (err) {
      result.failures.push({
        id: row.id,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return result;
}
