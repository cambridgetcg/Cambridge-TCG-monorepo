// Lot / bundle listings and sales. Parallel data layer to market_orders/
// market_trades — same escrow/payout lifecycle, different matching model
// (fixed-price listing, buy-whole-or-none).

import { query, transaction } from "@/lib/db";
import { resolveCommission, computeCommissionAmount } from "@cambridge-tcg/pricing";
import { getTrustTier } from "@/lib/escrow/trust-engine";
import { logLotTransition } from "./lot-lifecycle-log";
import { paymentExpiresAtForBuyer } from "@/lib/users/response-window";

// Default payment window when the buyer hasn't declared a response cadence.
// 24h matches the historical platform constant. Buyers with a declared
// response_window_hours (migration 0092 — the Asynchronous) get that
// window instead. See `lib/users/response-window.ts`.
const DEFAULT_PAYMENT_WINDOW_HOURS = 24;

export interface LotItem {
  sku: string;
  card_name: string | null;
  quantity: number;
}

export interface MarketLot {
  id: string;
  seller_user_id: string;
  title: string;
  description: string | null;
  price: string;
  image_url: string | null;
  status: "active" | "sold" | "cancelled";
  created_at: string;
  updated_at: string;
  // Joined
  seller_username?: string | null;
  seller_name?: string | null;
  // Seller reputation (global free trade, 2026-06-10): tier + reviews
  // replace identity verification at the point of trade. Tier name is
  // derived in TS from trust_score (no tier column in the DB).
  seller_trust_score?: number | null;
  seller_tier?: string | null;
  seller_avg_rating?: number | null;
  seller_review_count?: number | null;
  items?: LotItem[];
}

// Normalise the trust_profiles join into the MarketLot reputation fields.
// pg returns NUMERIC as string and INT as number; the tier name is derived
// the same way auction/state.ts does it (getTrustTier over TRUST_TIERS).
function withSellerReputation(row: Record<string, unknown>): MarketLot {
  const score = row.seller_trust_score != null ? Number(row.seller_trust_score) : null;
  return {
    ...row,
    seller_trust_score: score,
    seller_tier: score !== null ? getTrustTier(score).name : null,
    seller_avg_rating: row.seller_avg_rating != null ? parseFloat(String(row.seller_avg_rating)) : null,
    seller_review_count: row.seller_review_count != null ? Number(row.seller_review_count) : null,
  } as MarketLot;
}

export interface LotTrade {
  id: string;
  lot_id: string;
  buyer_user_id: string;
  seller_user_id: string;
  price: string;
  commission_amount: string;
  seller_payout: string;
  escrow_status: string;
  payment_expires_at: string | null;
  stripe_session_id: string | null;
  created_at: string;
}

export async function createLot(data: {
  sellerId: string;
  title: string;
  description?: string;
  price: number;
  imageUrl?: string;
  items: { sku: string; cardName?: string; quantity: number }[];
}): Promise<MarketLot> {
  if (data.items.length === 0) throw new Error("Lot must contain at least one item");

  const lot = await transaction(async (q) => {
    const lotRes = await q(
      `INSERT INTO market_lots (seller_user_id, title, description, price, image_url)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [data.sellerId, data.title, data.description || null, data.price.toFixed(2), data.imageUrl || null]
    );
    const lot = lotRes.rows[0] as MarketLot;

    for (const item of data.items) {
      await q(
        `INSERT INTO market_lot_items (lot_id, sku, card_name, quantity)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (lot_id, sku) DO UPDATE SET quantity = EXCLUDED.quantity`,
        [lot.id, item.sku, item.cardName || null, Math.max(1, item.quantity | 0)]
      );
    }

    return lot;
  });

  void logLotTransition({
    lotId: lot.id,
    action: "listed",
    actorId: data.sellerId,
    actorLabel: "seller",
    reason: `Lot listed at £${data.price.toFixed(2)}`,
    metadata: { item_count: data.items.length, price: data.price.toFixed(2) },
  });

  return lot;
}

export async function listLots(filters: {
  sellerId?: string;
  status?: "active" | "sold" | "cancelled";
  limit?: number;
  offset?: number;
}): Promise<{ lots: MarketLot[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (filters.sellerId) { conditions.push(`l.seller_user_id = $${idx++}`); params.push(filters.sellerId); }
  if (filters.status)   { conditions.push(`l.status = $${idx++}`);         params.push(filters.status); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(filters.limit || 24, 100);
  const offset = filters.offset || 0;

  const countRes = await query(
    `SELECT COUNT(*)::int FROM market_lots l ${where}`,
    params
  );
  const total = countRes.rows[0].count as number;

  params.push(limit, offset);
  const r = await query(
    `SELECT l.*, u.username AS seller_username, u.name AS seller_name,
            tp.trust_score AS seller_trust_score,
            tp.avg_rating AS seller_avg_rating,
            tp.total_reviews AS seller_review_count,
            (SELECT COUNT(*)::int FROM market_lot_items WHERE lot_id = l.id) AS item_count,
            (SELECT SUM(quantity)::int FROM market_lot_items WHERE lot_id = l.id) AS total_quantity
       FROM market_lots l
       LEFT JOIN users u ON u.id = l.seller_user_id
       LEFT JOIN trust_profiles tp ON tp.user_id = l.seller_user_id
       ${where}
      ORDER BY l.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}`,
    params
  );
  return { lots: r.rows.map(withSellerReputation), total };
}

export async function getLot(id: string): Promise<MarketLot | null> {
  const r = await query(
    `SELECT l.*, u.username AS seller_username, u.name AS seller_name,
            tp.trust_score AS seller_trust_score,
            tp.avg_rating AS seller_avg_rating,
            tp.total_reviews AS seller_review_count
       FROM market_lots l
       LEFT JOIN users u ON u.id = l.seller_user_id
       LEFT JOIN trust_profiles tp ON tp.user_id = l.seller_user_id
      WHERE l.id = $1`,
    [id]
  );
  if (r.rows.length === 0) return null;
  const lot = withSellerReputation(r.rows[0]);
  const items = await query(
    `SELECT sku, card_name, quantity FROM market_lot_items WHERE lot_id = $1 ORDER BY card_name ASC`,
    [id]
  );
  lot.items = items.rows as LotItem[];
  return lot;
}

export async function cancelLot(lotId: string, sellerId: string): Promise<boolean> {
  // Cancellable only when active AND no lot_trades exist past awaiting_payment.
  const r = await query(
    `UPDATE market_lots SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1 AND seller_user_id = $2 AND status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM market_lot_trades
           WHERE lot_id = $1 AND escrow_status NOT IN ('awaiting_payment','cancelled')
        )
      RETURNING id`,
    [lotId, sellerId]
  );
  if (r.rows.length > 0) {
    void logLotTransition({
      lotId,
      action: "cancelled",
      actorId: sellerId,
      actorLabel: "seller",
      reason: "Seller cancelled active lot listing",
    });
  }
  return r.rows.length > 0;
}

// Lot purchases are paused: after payment there is no fulfilment path —
// no ship/verify/complete flow exists for lot trades, so a purchase takes
// the buyer's money and strands the trade in awaiting_shipment forever.
// The guard lives in the lib (not just the UI) so every caller of
// beginLotPurchase is stopped. Browsing and listing lots stay live.
export const LOT_PURCHASES_PAUSED = true;
export const LOT_PURCHASES_PAUSED_MESSAGE =
  "Lot purchases are paused while fulfilment is rebuilt — browse the singles market meanwhile.";

// Atomic purchase: create a lot_trade row in awaiting_payment, mark the lot
// 'sold' (we don't support partial-fills; one successful purchase takes it
// off the market). If payment doesn't complete in 24h a sweep should
// re-activate the lot; for MVP that's a follow-up.
export async function beginLotPurchase(data: {
  lotId: string;
  buyerId: string;
}): Promise<{ ok: true; trade: LotTrade } | { ok: false; error: string }> {
  if (LOT_PURCHASES_PAUSED) {
    return { ok: false, error: LOT_PURCHASES_PAUSED_MESSAGE };
  }
  // Buyer-aware payment deadline. response_window_hours overrides the
  // 24h platform default when the buyer has declared a cadence.
  // Computed before the transaction opens: this reads through the root
  // pool, and awaiting it while the tx holds the pool's only prod
  // connection would self-deadlock.
  const paymentExpiresAt = await paymentExpiresAtForBuyer(data.buyerId, DEFAULT_PAYMENT_WINDOW_HOURS);
  const result = await transaction(async (q) => {
    const lotRes = await q(
      `SELECT * FROM market_lots WHERE id = $1 FOR UPDATE`,
      [data.lotId]
    );
    if (lotRes.rows.length === 0) {
      return { ok: false as const, error: "Lot not found" };
    }
    const lot = lotRes.rows[0];
    if (lot.status !== "active") {
      return { ok: false as const, error: `Lot is ${lot.status}` };
    }
    if (lot.seller_user_id === data.buyerId) {
      return { ok: false as const, error: "You can't buy your own lot" };
    }

    // Seller trust + tier → commission rate. Phase 6 of kingdom-049
    // closed a real inconsistency: prior to this, lots.ts used only
    // trust score, while market/db.ts used min(tier, trust). A Platinum
    // seller listing a lot did not get their tier discount. Now both
    // paths use the same resolver; the rate a lot trade is charged
    // matches what the user-detail hub shows. See
    // docs/connections/the-pricing-arrow.md (S17) — the arrow now
    // covers commissions, not just retail prices.
    const sellerRow = await q(
      `SELECT u.trust_score, t.p2p_commission_rate AS tier_rate
         FROM users u
         LEFT JOIN tiers t ON t.id = u.tier_id
        WHERE u.id = $1`,
      [lot.seller_user_id]
    );
    const trustScore = sellerRow.rows[0]?.trust_score ?? 0;
    const tierRate = sellerRow.rows[0]?.tier_rate != null
      ? parseFloat(sellerRow.rows[0].tier_rate)
      : null;
    const { rate } = resolveCommission({ trustScore, tierRate, kind: "p2p" });
    const trust = trustScore; // back-compat for the lifecycle-log metadata below
    const price = parseFloat(lot.price);
    // Per-item commission cap (the fairness fix): commission never exceeds
    // the absolute cap in @cambridge-tcg/pricing, applied after the trust
    // discount. See /methodology/fees.
    const commission = computeCommissionAmount(price, rate).amount;
    const sellerPayout = price - commission;

    const tradeRes = await q(
      `INSERT INTO market_lot_trades
         (lot_id, buyer_user_id, seller_user_id, price,
          commission_rate, commission_amount, seller_payout,
          payment_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [data.lotId, data.buyerId, lot.seller_user_id,
       price.toFixed(2), rate.toFixed(4),
       commission.toFixed(2), sellerPayout.toFixed(2),
       paymentExpiresAt]
    );

    // Flip lot to 'sold' immediately; if payment expires the sweep will
    // re-activate it. This prevents two buyers racing for the same lot.
    await q(
      `UPDATE market_lots SET status = 'sold', updated_at = NOW() WHERE id = $1`,
      [data.lotId]
    );

    return { ok: true as const, trade: tradeRes.rows[0] as LotTrade };
  });

  if (result.ok) {
    const trade = result.trade;
    const price = parseFloat(trade.price);

    // Two lifecycle rows: lot listing → sold, and the trade itself
    // gets its "trade_created" anchor.
    void logLotTransition({
      lotId: data.lotId,
      action: "sold",
      actorId: data.buyerId,
      actorLabel: "buyer",
      reason: `Lot purchased at £${price.toFixed(2)}`,
      metadata: { trade_id: trade.id },
    });
    void logLotTransition({
      lotTradeId: trade.id,
      action: "trade_created",
      actorId: data.buyerId,
      actorLabel: "buyer",
      reason: "Lot purchase created — awaiting payment",
      metadata: { lot_id: data.lotId, price: price.toFixed(2) },
    });
  }

  return result;
}

// Called from the Stripe webhook on checkout.session.completed when
// metadata.type === 'market_lot_payment'.
export async function markLotTradePaid(tradeId: string, sessionId: string, paymentIntentId: string | null): Promise<void> {
  // Atomic gate via WHERE escrow_status='awaiting_payment' RETURNING
  // prevents double-fire on Stripe webhook retries.
  const r = await query(
    `UPDATE market_lot_trades
        SET escrow_status = 'awaiting_shipment',
            buyer_paid_at = NOW(),
            stripe_session_id = $2,
            stripe_payment_intent = $3,
            updated_at = NOW()
      WHERE id = $1 AND escrow_status = 'awaiting_payment'
      RETURNING id, buyer_user_id, seller_user_id, price`,
    [tradeId, sessionId, paymentIntentId]
  );
  if (r.rows.length === 0) return;
  const t = r.rows[0];
  void logLotTransition({
    lotTradeId: tradeId,
    action: "paid",
    actorId: t.buyer_user_id,
    actorLabel: "stripe-webhook",
    reason: `Buyer paid £${t.price}`,
    metadata: { stripe_session_id: sessionId, stripe_payment_intent: paymentIntentId },
  });
  // Trust recompute on the buyer — successful payment is positive.
  void import("@/lib/escrow/trust-engine").then(({ calculateTrustScore }) =>
    calculateTrustScore(t.buyer_user_id).catch(() => { /* ignore */ }),
  );

  // Investor portfolio side-effect: lot purchase locks funds and
  // commits the buyer's ownership claim. Auto-acquire each contained
  // SKU at the lot's per-sku allocated price (proportional to count).
  // Realize on the seller side at the same allocations. Skips silently
  // if the lot has no items (shouldn't happen — createLot rejects
  // empty lots).
  void import("@/lib/portfolio/realize").then(async ({ recordAcquisition, closePosition }) => {
    const items = await query(
      `SELECT i.sku, i.card_name, i.quantity
         FROM market_lot_items i
         JOIN market_lot_trades lt ON lt.lot_id = i.lot_id
        WHERE lt.id = $1`,
      [tradeId],
    ).catch(() => ({ rows: [] as { sku: string; card_name: string | null; quantity: number }[] }));
    if (items.rows.length === 0) return;

    const totalUnits = items.rows.reduce((s, r) => s + r.quantity, 0);
    const lotPrice = parseFloat(t.price);
    // Equal per-unit allocation — naive but defensible. A more
    // sophisticated split would weight by reference price, but lots
    // are bundled-discount contexts so equal-weight is closest to
    // user intuition.
    const perUnit = totalUnits > 0 ? Math.round((lotPrice / totalUnits) * 100) / 100 : 0;

    for (const item of items.rows) {
      const itemValue = Math.round(perUnit * item.quantity * 100) / 100;
      await recordAcquisition({
        userId: t.buyer_user_id,
        sku: item.sku,
        cardName: item.card_name ?? undefined,
        quantity: item.quantity,
        pricePaidGbp: itemValue,
        acquisitionSource: "lot_trade",
        acquisitionReferenceId: `${tradeId}:${item.sku}`,
      }).catch((err) => console.error("[portfolio/auto-acquire/lot] failed:", err));
      await closePosition({
        userId: t.seller_user_id,
        sku: item.sku,
        quantity: item.quantity,
        proceedsGbp: itemValue,
        feesGbp: 0,
        exitKind: "lot_trade",
        exitReferenceId: `${tradeId}:${item.sku}`,
        notes: `Sold via lot bundle · per-unit allocation £${perUnit.toFixed(2)} of lot total £${lotPrice.toFixed(2)}`,
      }).catch((err) => console.error("[portfolio/realize/lot] failed:", err));
    }
  });
}

export async function getLotTrade(id: string): Promise<LotTrade | null> {
  const r = await query(`SELECT * FROM market_lot_trades WHERE id = $1`, [id]);
  return (r.rows[0] as LotTrade) ?? null;
}
