import { createHash } from "node:crypto";
import { query, transaction } from "@/lib/db";
import type { MarketOrder, MarketTrade, OrderBookEntry, OrderBookSummary, CardOrderBook } from "./types";
import { COMMISSION_RATE, commissionRateForScore } from "./types";
import { resolveCommission, computeCommissionAmount } from "@cambridge-tcg/pricing";
import { postActivity, awardAchievement } from "@/lib/social/db";
import { routeTrade } from "@/lib/escrow/service-tiers";
import { sendBuyerMatchEmail, sendSellerMatchEmail, sendCancelEmail } from "./email";
import { formatPrice } from "@/lib/format";
import { notify } from "@/lib/notifications/db";

// Default open-order TTL when the caller doesn't specify expires_at.
// 30 days mirrors typical online marketplace conventions.
const DEFAULT_ORDER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Default payment window for buyers without a declared response_window_hours
// (migration 0092 — the Asynchronous). 24h matches the historical platform
// constant; buyers who declare a different cadence have their window apply
// instead. See `responseWindowHours` in `lib/users/response-window.ts`.
const DEFAULT_PAYMENT_WINDOW_HOURS = 24;

// ── Catalog resolution ──
// The listing API used to trust whatever `sku` string the client sent,
// so a seller typing the card NUMBER printed on the card ("OP01-001")
// created a phantom listing (card_name null) that no browse surface could
// find, and client-sent card names could disagree with the catalog. This
// resolves a raw identifier against card_set_cards (unique idx on sku) and
// returns the catalog's OWN card metadata, so identity is server-owned.

export interface CatalogCard {
  sku: string;
  card_number: string;
  card_name: string;
  set_code: string;
  set_name: string;
  rarity: string | null;
  image_url: string | null;
}

export type CatalogResolution =
  | { ok: true; card: CatalogCard }
  | { ok: false; reason: string; suggestions: string[] };

const CATALOG_SELECT = `
  SELECT c.sku, c.card_number, c.card_name, c.set_code,
         s.set_name, c.rarity, c.image_url
    FROM card_set_cards c
    JOIN card_sets s ON s.set_code = c.set_code`;

/**
 * Resolve a raw identifier (canonical SKU or the bare card number printed
 * on the card) to a single catalog card. Unambiguous → { ok: true }.
 * Not found / ambiguous → { ok: false } carrying the nearest canonical
 * SKUs so the caller can teach a 400.
 */
export async function resolveCatalogCard(raw: string): Promise<CatalogResolution> {
  const input = (raw ?? "").trim();
  if (!input) return { ok: false, reason: "Card SKU required.", suggestions: [] };

  // 1) Exact canonical SKU (e.g. OP-OP01-001-JP).
  const bySku = await query(`${CATALOG_SELECT} WHERE c.sku = $1 LIMIT 1`, [input]);
  if (bySku.rows.length === 1) return { ok: true, card: bySku.rows[0] as CatalogCard };

  // 2) Bare card number printed on the card (e.g. OP01-001). Accept when
  //    it maps to exactly one SKU; otherwise ask the caller to pick.
  const byNumber = await query(
    `${CATALOG_SELECT} WHERE UPPER(c.card_number) = UPPER($1) ORDER BY c.sku`,
    [input],
  );
  if (byNumber.rows.length === 1) return { ok: true, card: byNumber.rows[0] as CatalogCard };
  if (byNumber.rows.length > 1) {
    return {
      ok: false,
      reason: `Card number "${input}" has ${byNumber.rows.length} printings on the platform — list by the exact SKU instead.`,
      suggestions: byNumber.rows.map((r) => r.sku as string),
    };
  }

  // 3) Unknown identifier — surface the nearest canonical SKUs.
  const near = await query(
    `SELECT c.sku FROM card_set_cards c
      WHERE c.sku ILIKE $1 OR UPPER(c.card_number) LIKE UPPER($2) OR c.card_name ILIKE $1
      ORDER BY c.sku LIMIT 6`,
    [`%${input}%`, `${input}%`],
  );
  return {
    ok: false,
    reason: `No catalog card matches "${input}". Use a canonical SKU (like OP-OP01-001-JP) or the exact card number printed on the card (like OP01-001).`,
    suggestions: near.rows.map((r) => r.sku as string),
  };
}

/**
 * Count a user's existing OPEN asks that would duplicate a proposed one
 * (same sku, condition, price). Used to warn — not block — on a probable
 * accidental re-list. Returns 0 for bids (duplicate bids are normal depth).
 */
export async function countDuplicateOpenAsks(
  userId: string, sku: string, condition: string, price: number,
): Promise<number> {
  const r = await query(
    `SELECT COUNT(*)::int AS n FROM market_orders
      WHERE user_id = $1 AND side = 'ask' AND sku = $2 AND condition = $3
        AND price = $4 AND status IN ('open', 'partially_filled')`,
    [userId, sku, condition, price.toFixed(2)],
  );
  return r.rows[0]?.n ?? 0;
}

// ── Lazy expiry sweep ──
// Cheap idempotent maintenance fired from any market read. Marks orders past
// their TTL as expired, and cancels trades whose buyer never paid in time
// (restoring the maker's filled_quantity so the order can match again).
//
// Behavior policy:
//   - The cron entry point (runMarketMaintenance) calls this directly and
//     surfaces any error to Vercel Cron's status (red = needs attention).
//   - Read paths (getCardOrderBook, etc.) call sweepExpiredBestEffort below,
//     which swallows errors so a sweep blip doesn't 500 user-facing reads.
let lastSweepAt = 0;
async function sweepExpired(force = false): Promise<void> {
  // Throttle: at most once per minute per process. Reads are frequent;
  // expiry only needs minute-level resolution. Cron entry point passes
  // force=true so it always runs.
  const now = Date.now();
  if (!force && now - lastSweepAt < 60_000) return;
  lastSweepAt = now;

  // Expire stale orders + fire a one-shot notification to the maker so
  // they know their listing is off the book. Dedup on the order id so
  // a replay of the sweep is idempotent.
  const expiredOrders = await query(
    `UPDATE market_orders SET status = 'expired', updated_at = NOW()
      WHERE status IN ('open', 'partially_filled')
        AND expires_at IS NOT NULL AND expires_at <= NOW()
      RETURNING id, user_id, side, sku, card_name, price, quantity, filled_quantity`
  );
  for (const o of expiredOrders.rows) {
    const filled = o.filled_quantity > 0
      ? ` (${o.filled_quantity} of ${o.quantity} filled before expiry)` : "";
    await notify({
      userId: o.user_id,
      kind: "market.order_expired",
      title: `Your ${o.side === "bid" ? "bid" : "ask"} on ${o.card_name || o.sku} expired${filled}`,
      body: `Price was ${formatPrice(parseFloat(o.price))}. Re-list from the card page if you still want it on the book.`,
      linkUrl: `/market/${encodeURIComponent(o.sku)}`,
      referenceType: "market_order",
      referenceId: `${o.id}:expired`,
    });
  }

  // Trades whose payment window elapsed: cancel them and roll back the
  // maker order's filled_quantity so the listing returns to the book.
  const expiredTrades = await query(
    `SELECT id, bid_order_id, ask_order_id, quantity, buyer_id, seller_id
       FROM market_trades
      WHERE escrow_status = 'awaiting_payment'
        AND payment_expires_at IS NOT NULL
        AND payment_expires_at <= NOW()`
  );

  for (const t of expiredTrades.rows) {
    // Flip + restores commit together: a crash between them would leave the
    // ask stranded as 'filled' with no live trade, and the sweep would never
    // revisit (the trade is already 'cancelled'). Mirrors approveCancel.
    const cancelled = await transaction(async (q) => {
      const upd = await q(
        `UPDATE market_trades SET escrow_status = 'cancelled', updated_at = NOW()
          WHERE id = $1 AND escrow_status = 'awaiting_payment' RETURNING id`,
        [t.id]
      );
      if (upd.rows.length === 0) return false;
      // Restore both orders. Taker order is the one created at match time —
      // the cleanest behaviour is to restore qty on both and let either side
      // re-match if still active.
      for (const orderId of [t.bid_order_id, t.ask_order_id]) {
        await q(
          `UPDATE market_orders
              SET filled_quantity = GREATEST(filled_quantity - $1, 0),
                  status = CASE
                    WHEN GREATEST(filled_quantity - $1, 0) = 0 THEN 'open'
                    WHEN GREATEST(filled_quantity - $1, 0) < quantity THEN 'partially_filled'
                    ELSE status
                  END,
                  updated_at = NOW()
            WHERE id = $2 AND status IN ('filled', 'partially_filled')`,
          [t.quantity, orderId]
        );
      }
      return true;
    });
    if (!cancelled) continue;

    // Notify both parties about the cancellation — email + in-app.
    // The seller is the one owed money, so their bell also lights up.
    const participants = await query(
      `SELECT u.id, u.email, t.sku, COALESCE(o.card_name, t.sku) AS card_name
         FROM market_trades t
         JOIN users u ON u.id = ANY(ARRAY[t.buyer_id, t.seller_id])
         LEFT JOIN market_orders o ON o.id = t.bid_order_id
        WHERE t.id = $1`,
      [t.id]
    );
    // Copy stays window-agnostic: each trade's deadline is its own
    // payment_expires_at (the buyer's declared cadence or the flow
    // default), so naming a fixed hour count here would lie for
    // slow-clock buyers.
    for (const p of participants.rows) {
      sendCancelEmail({
        email: p.email,
        cardName: p.card_name,
        reason: "Buyer did not pay within the payment window.",
      }).catch((err) => console.error("[market] Cancel email failed:", err));

      const isBuyer = p.id === t.buyer_id;
      await notify({
        userId: p.id,
        kind: "market.payment_timeout",
        title: isBuyer
          ? `Your trade for ${p.card_name} was cancelled — payment window missed`
          : `Trade cancelled — ${p.card_name} buyer did not pay in time`,
        body: isBuyer
          ? "You did not complete payment within your payment window. The seller's listing is back on the book."
          : "The payment window elapsed. Your listing has been returned to the order book.",
        linkUrl: "/account/trades",
        referenceType: "market_trade",
        referenceId: `${t.id}:payment_timeout`,
      });
    }

    // Lifecycle row for the cancellation. System-actor; no user
    // initiated it. Mirrors auctions' unpaid_lapsed lifecycle row.
    void import("./lifecycle-log").then(({ logTradeTransition }) =>
      logTradeTransition({
        tradeId: t.id,
        action: "cancelled",
        actorLabel: "system:market-sweep",
        reason: "Payment window elapsed without buyer payment",
        metadata: { reason_code: "payment_timeout" },
      }),
    );

    // Buyer-default fraud signal — same severity tier as auction
    // default. The trust engine + auto-suspend stack picks it up.
    void import("@/lib/fraud/detection").then(async ({ emitSignal, SIGNAL_DEFS }) => {
      const today = new Date().toISOString().slice(0, 10);
      await emitSignal({
        userId: t.buyer_id,
        def: SIGNAL_DEFS.TRADE_PAYMENT_DEFAULT,
        tradeId: t.id,
        description: "Buyer let the trade payment window elapse",
        dedupeKey: `trade-default:${t.id}:${today}`,
      });
    }).catch((err) => console.error("[market/sweep] default signal failed:", err));

    // Trust recompute — buyer's reliability score slips.
    void import("@/lib/escrow/trust-engine").then(({ calculateTrustScore }) =>
      calculateTrustScore(t.buyer_id).catch(() => { /* ignore */ }),
    );
  }
}

// ── Place order + attempt match ──

/**
 * Thrown when a placeOrder is rejected because the user's trust profile
 * disallows it (suspended, over per-trade limit, or over daily limit).
 * The market route handler catches this and surfaces the message to the
 * UI as a 403.
 */
export class TrustGateError extends Error {
  warnings: string[];
  constructor(message: string, warnings: string[] = []) {
    super(message);
    this.name = "TrustGateError";
    this.warnings = warnings;
  }
}

export async function placeOrder(data: {
  userId: string;
  side: "bid" | "ask";
  sku: string;
  cardName?: string;
  setCode?: string;
  setName?: string;
  imageUrl?: string;
  condition: string;
  price: number;
  quantity: number;
  notes?: string;
}): Promise<{ order: MarketOrder; trades: MarketTrade[] }> {
  // Trust gate: refuse the order if the user is suspended or the order
  // value exceeds their per-trade or remaining-daily limits. canTrade()
  // already considers all of those — calling it here turns it from
  // info-only into actual enforcement (it was previously only consumed
  // by GET endpoints for display).
  const orderValue = data.price * data.quantity;
  const { canTrade } = await import("@/lib/escrow/trust-engine");
  const gate = await canTrade(data.userId, orderValue);
  if (!gate.allowed) {
    throw new TrustGateError(gate.reason ?? "Order rejected by trust gate.", gate.warnings);
  }

  // Fraud detection (inline, fire-and-forget): a young account placing
  // a high-value order produces a signal that feeds trust penalties
  // and the upcoming auto-suspend gate. Idempotent per UTC day + value
  // bucket. Detached so a fraud-lib error never blocks an order place.
  void import("@/lib/fraud/passes").then(({ checkNewAccountHighValue }) =>
    checkNewAccountHighValue(data.userId, orderValue),
  ).catch((err) => console.error("[fraud/inline] new-account check failed:", err));

  // Maintenance: opportunistically clear expired orders/trades before matching
  // so this taker doesn't try to fill against stale rows.
  await sweepExpiredBestEffort();

  const trades: MarketTrade[] = [];
  // Effective payment window (hours) per trade id — the buyer's declared
  // cadence or the flow default. Feeds the "pay within N hours" copy so
  // emails/notifications never promise a window the sweep won't enforce.
  const paymentWindowByTrade = new Map<string, number>();

  const { order } = await transaction(async (q) => {
    // Insert the order with a default 30-day TTL
    const expiresAt = new Date(Date.now() + DEFAULT_ORDER_TTL_MS).toISOString();
    const orderResult = await q(
      `INSERT INTO market_orders (user_id, side, sku, card_name, set_code, set_name, image_url, condition, price, quantity, notes, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [data.userId, data.side, data.sku, data.cardName || null, data.setCode || null,
       data.setName || null, data.imageUrl || null, data.condition, data.price.toFixed(2),
       data.quantity, data.notes || null, expiresAt]
    );
    let order = orderResult.rows[0] as MarketOrder;
    let remainingQty = data.quantity;

    // Try to match against opposite side. Pull the maker's trust + flag state
    // in the same query so we can route each resulting trade to its escrow
    // tier without a follow-up round trip per match.
    const oppositeSide = data.side === "bid" ? "ask" : "bid";
    const priceOp = data.side === "bid" ? "<=" : ">=";
    const priceOrder = data.side === "bid" ? "ASC" : "DESC";

    // JOIN trust + membership tier in one query so commission is resolvable
    // in-memory inside the match loop (no per-iteration round trip).
    const matchResult = await q(
      `SELECT o.*,
              u.trust_score                          AS maker_trust,
              u.response_window_hours                AS maker_response_window,
              COALESCE(tp.is_flagged, false)         AS maker_flagged,
              t.p2p_commission_rate                  AS maker_p2p_rate
         FROM market_orders o
         JOIN users u ON u.id = o.user_id
         LEFT JOIN trust_profiles tp ON tp.user_id = o.user_id
         LEFT JOIN tiers          t  ON t.id        = u.tier_id
        WHERE o.sku = $1 AND o.side = $2
          AND o.status IN ('open', 'partially_filled')
          AND o.condition = $3 AND o.price ${priceOp} $4 AND o.user_id != $5
        ORDER BY o.price ${priceOrder}, o.created_at ASC
        FOR UPDATE OF o`,
      [data.sku, oppositeSide, data.condition, data.price.toFixed(2), data.userId]
    );

    // Taker's trust + tier (one lookup, reused per match)
    const takerInfoRow = await q(
      `SELECT u.trust_score,
              u.response_window_hours        AS response_window,
              COALESCE(tp.is_flagged, false) AS is_flagged,
              t.p2p_commission_rate          AS p2p_rate
         FROM users u
         LEFT JOIN trust_profiles tp ON tp.user_id = u.id
         LEFT JOIN tiers          t  ON t.id       = u.tier_id
        WHERE u.id = $1`,
      [data.userId]
    );
    const takerTrust = takerInfoRow.rows[0]?.trust_score ?? 0;
    const takerFlagged = takerInfoRow.rows[0]?.is_flagged ?? false;
    const takerTierP2pRate = takerInfoRow.rows[0]?.p2p_rate
      ? parseFloat(takerInfoRow.rows[0].p2p_rate)
      : null;
    // Taker's declared cadence (migration 0092), pulled here so the
    // per-trade payment window can be resolved WITHOUT a root-pool
    // query() inside this transaction (that would acquire a second
    // pooled connection while this one is held — the max:1 self-deadlock).
    const takerResponseWindow = takerInfoRow.rows[0]?.response_window as
      | number
      | null
      | undefined;

    for (const match of matchResult.rows) {
      if (remainingQty <= 0) break;

      const matchAvail = match.quantity - match.filled_quantity;
      const fillQty = Math.min(remainingQty, matchAvail);
      // Trade executes at the resting order's price (maker price)
      const tradePrice = parseFloat(match.price);
      const tradeValue = tradePrice * fillQty;

      const buyerId = data.side === "bid" ? data.userId : match.user_id;
      const sellerId = data.side === "ask" ? data.userId : match.user_id;
      const bidOrderId = data.side === "bid" ? order.id : match.id;
      const askOrderId = data.side === "ask" ? order.id : match.id;

      // Resolve escrow tier from trust + value + card metadata so admin and
      // emails can branch on it. Stored on the trade row itself.
      const sellerTrust = sellerId === data.userId ? takerTrust : (match.maker_trust ?? 0);
      const buyerTrust  = buyerId  === data.userId ? takerTrust : (match.maker_trust ?? 0);
      const sellerFlag  = sellerId === data.userId ? takerFlagged : !!match.maker_flagged;
      const buyerFlag   = buyerId  === data.userId ? takerFlagged : !!match.maker_flagged;

      // Resolve commission from BOTH membership tier and trust score; take
      // whichever is more favourable to the seller. Reputation earned via
      // trades AND membership earned via Platinum/spending both lower the
      // rate without one cancelling the other.
      //
      // Phase 6 of kingdom-049: the min(tier, trust) combine now lives in
      // packages/pricing as `resolveCommission`. Same formula, one source.
      // Sister site at apps/storefront/src/lib/market/lots.ts uses it too,
      // closing a previous inconsistency where lots ignored the tier path.
      const sellerIsTaker = sellerId === data.userId;
      const sellerTierRate = sellerIsTaker ? takerTierP2pRate
        : (match.maker_p2p_rate ? parseFloat(match.maker_p2p_rate) : null);
      const { rate: sellerCommissionRate, trustRate } = resolveCommission({
        trustScore: sellerTrust,
        tierRate: sellerTierRate,
        kind: "p2p",
      });
      void trustRate; // surface for future logging; preserves naming
      // Per-item commission cap (the fairness fix): the absolute cap in
      // @cambridge-tcg/pricing bounds the fee after the trust/membership
      // discount, so a four-figure card never pays more than incumbents.
      // See /methodology/fees.
      const commission = computeCommissionAmount(tradeValue, sellerCommissionRate).amount;
      const sellerPayout = tradeValue - commission;

      const routing = await routeTrade({
        tradeValue,
        sellerTrustScore: sellerTrust,
        buyerTrustScore: buyerTrust,
        sellerIsFlagged: sellerFlag,
        buyerIsFlagged: buyerFlag,
        cardName: data.cardName || match.card_name || undefined,
        condition: data.condition,
      });

      // Buyer-aware payment deadline. A buyer with a declared cadence
      // (response_window_hours, migration 0092) gets their window;
      // everyone else gets the platform default of 24h. See
      // `lib/users/response-window.ts` and `docs/methodology/response-windows.md`.
      // The value was resolved in the match/taker lookups above — the
      // buyer is either the taker (declared window pulled with the taker's
      // trust) or a matched maker (pulled per row) — so NO query runs
      // inside this transaction. The hours ride along per trade so the
      // match emails/notifications below can state the actual window.
      const buyerResponseWindow = buyerId === data.userId
        ? takerResponseWindow
        : (match.maker_response_window as number | null | undefined);
      const paymentWindowHours = buyerResponseWindow ?? DEFAULT_PAYMENT_WINDOW_HOURS;
      const paymentExpiresAt = new Date(Date.now() + paymentWindowHours * 60 * 60 * 1000).toISOString();

      const tradeResult = await q(
        `INSERT INTO market_trades
           (bid_order_id, ask_order_id, buyer_id, seller_id, sku, price, quantity,
            commission_rate, commission_amount, seller_payout,
            escrow_tier, requires_photos, requires_inspection, seller_ships_to,
            dispute_window_hours, payout_hold_days, payment_expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING *`,
        [bidOrderId, askOrderId, buyerId, sellerId, data.sku,
         tradePrice.toFixed(2), fillQty, sellerCommissionRate.toFixed(4),
         commission.toFixed(2), sellerPayout.toFixed(2),
         routing.tier, routing.requiresPhotos, routing.requiresInspection,
         routing.sellerShipsTo, routing.disputeWindowHours, routing.payoutHoldDays,
         paymentExpiresAt]
      );
      const insertedTrade = tradeResult.rows[0] as MarketTrade;
      trades.push(insertedTrade);
      paymentWindowByTrade.set(insertedTrade.id, paymentWindowHours);

      // Update matched order
      const newMatchFilled = match.filled_quantity + fillQty;
      const matchStatus = newMatchFilled >= match.quantity ? "filled" : "partially_filled";
      await q(
        `UPDATE market_orders SET filled_quantity = $1, status = $2, updated_at = NOW() WHERE id = $3`,
        [newMatchFilled, matchStatus, match.id]
      );

      remainingQty -= fillQty;
    }

    // Update our order
    const newFilled = data.quantity - remainingQty;
    const newStatus = newFilled >= data.quantity ? "filled" : newFilled > 0 ? "partially_filled" : "open";
    await q(
      `UPDATE market_orders SET filled_quantity = $1, status = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [newFilled, newStatus, order.id]
    );
    order = { ...order, filled_quantity: newFilled, status: newStatus };

    return { order };
  });

  // Lifecycle row for each newly created trade. Anchors the audit
  // chain — every later transition references trade_id back to this.
  if (trades.length > 0) {
    void import("./lifecycle-log").then(({ logTradeTransition }) => {
      for (const t of trades) {
        logTradeTransition({
          tradeId: t.id,
          action: "created",
          actorId: data.userId,
          actorLabel: "user:place-order",
          reason: `Order matched at ${formatPrice(parseFloat(t.price))} × ${t.quantity}`,
          metadata: {
            sku: t.sku,
            price: t.price,
            quantity: t.quantity,
            buyer_id: t.buyer_id,
            seller_id: t.seller_id,
            escrow_tier: t.escrow_tier,
          },
        });
      }
    });
  }

  // Match notifications (fire-and-forget). One query for all participant emails.
  if (trades.length > 0) {
    const participantIds = Array.from(new Set(trades.flatMap((t) => [t.buyer_id, t.seller_id])));
    query(
      `SELECT id, email FROM users WHERE id = ANY($1)`,
      [participantIds]
    ).then((r) => {
      const emailById = new Map<string, string>(r.rows.map((u: { id: string; email: string }) => [u.id, u.email]));
      const cardName = data.cardName || data.sku;
      for (const t of trades) {
        const buyerEmail = emailById.get(t.buyer_id);
        const sellerEmail = emailById.get(t.seller_id);
        const total = parseFloat(t.price) * t.quantity;
        const windowHours = paymentWindowByTrade.get(t.id) ?? DEFAULT_PAYMENT_WINDOW_HOURS;
        if (buyerEmail) {
          sendBuyerMatchEmail({
            email: buyerEmail,
            cardName,
            price: formatPrice(total),
            expiresAt: t.payment_expires_at || new Date().toISOString(),
            windowHours,
          }).catch((err) => console.error("[market] Buyer match email failed:", err));
        }
        if (sellerEmail) {
          sendSellerMatchEmail({
            email: sellerEmail,
            cardName,
            price: formatPrice(total),
            windowHours,
          }).catch((err) => console.error("[market] Seller match email failed:", err));
        }
      }
    }).catch(() => {});

    // In-app notifications alongside the emails. Buyer sees an urgent
    // "pay within their window" item; seller sees a confirmation. Dedup
    // key uses the trade id + role so both sides get distinct rows and
    // neither gets a duplicate if placeOrder were somehow retried.
    const matchCardName = data.cardName || data.sku;
    for (const t of trades) {
      const total = parseFloat(t.price) * t.quantity;
      const windowHours = paymentWindowByTrade.get(t.id) ?? DEFAULT_PAYMENT_WINDOW_HOURS;
      notify({
        userId: t.buyer_id,
        kind: "market.matched_buyer",
        title: `Matched: ${matchCardName} for ${formatPrice(total)} — pay within ${windowHours}h`,
        body: "Complete payment now or the listing returns to the seller's order book.",
        linkUrl: "/account/trades",
        referenceType: "market_trade",
        referenceId: `${t.id}:matched_buyer`,
      });
      notify({
        userId: t.seller_id,
        kind: "market.matched_seller",
        title: `You have a match: ${matchCardName} sold for ${formatPrice(total)}`,
        body: "Awaiting buyer payment. You'll be notified when payment lands.",
        linkUrl: "/account/trades",
        referenceType: "market_trade",
        referenceId: `${t.id}:matched_seller`,
      });
    }

    for (const trade of trades) {
      postActivity(trade.buyer_id, "trade_completed", "Completed a P2P trade").catch(() => {});
      postActivity(trade.seller_id, "trade_completed", "Completed a P2P trade").catch(() => {});

      // Check trade count milestones for buyer and seller
      for (const tradeUserId of [trade.buyer_id, trade.seller_id]) {
        query(
          `SELECT COUNT(*) FROM market_trades WHERE buyer_id = $1 OR seller_id = $1`,
          [tradeUserId]
        ).then((res) => {
          const count = parseInt(res.rows[0].count, 10);
          if (count === 1) awardAchievement(tradeUserId, "first_trade").catch(() => {});
          if (count === 10) awardAchievement(tradeUserId, "trades_10").catch(() => {});
          if (count === 50) awardAchievement(tradeUserId, "trades_50").catch(() => {});
          if (count === 100) awardAchievement(tradeUserId, "trades_100").catch(() => {});
        }).catch(() => {});
      }
    }
  }

  return { order, trades };
}

// ── Cancel order ──

export async function cancelOrder(orderId: string, userId: string): Promise<boolean> {
  const result = await query(
    `UPDATE market_orders SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status IN ('open', 'partially_filled') RETURNING id`,
    [orderId, userId]
  );
  return result.rows.length > 0;
}

// ── Order book for a single card ──

export async function getCardOrderBook(sku: string): Promise<CardOrderBook> {
  await sweepExpiredBestEffort();
  // Aggregate bids (descending price)
  const bidsResult = await query(
    `SELECT price, SUM(quantity - filled_quantity) as total_quantity, COUNT(*) as order_count
     FROM market_orders WHERE sku = $1 AND side = 'bid' AND status IN ('open', 'partially_filled')
     GROUP BY price ORDER BY price DESC LIMIT 20`,
    [sku]
  );

  // Aggregate asks (ascending price)
  const asksResult = await query(
    `SELECT price, SUM(quantity - filled_quantity) as total_quantity, COUNT(*) as order_count
     FROM market_orders WHERE sku = $1 AND side = 'ask' AND status IN ('open', 'partially_filled')
     GROUP BY price ORDER BY price ASC LIMIT 20`,
    [sku]
  );

  // Card info from any order
  const cardInfo = await query(
    `SELECT card_name, image_url FROM market_orders WHERE sku = $1 AND card_name IS NOT NULL LIMIT 1`,
    [sku]
  );

  // Public tape: completed market facts only. Never select t.* here. This
  // function feeds unauthenticated routes, so participant ids, payment and
  // shipping references, dispute/admin text, payouts and workflow timestamps
  // must be impossible to return by construction.
  const tradesResult = await query(
    `SELECT t.id, t.price, t.quantity,
            COALESCE(t.completed_at, t.created_at) AS traded_at
       FROM market_trades t
      WHERE t.sku = $1
        AND t.escrow_status = 'completed'
      ORDER BY COALESCE(t.completed_at, t.created_at) DESC
      LIMIT 20`,
    [sku]
  );

  const bids = bidsResult.rows.map((r) => ({
    price: r.price,
    total_quantity: parseInt(r.total_quantity, 10),
    order_count: parseInt(r.order_count, 10),
  })) as OrderBookEntry[];

  const asks = asksResult.rows.map((r) => ({
    price: r.price,
    total_quantity: parseInt(r.total_quantity, 10),
    order_count: parseInt(r.order_count, 10),
  })) as OrderBookEntry[];

  const recentTrades = tradesResult.rows.map((row) => ({
    public_ref: createHash("sha256")
      .update(`cambridge-tcg:public-market-trade:v1:${String(row.id)}`)
      .digest("hex")
      .slice(0, 20),
    price: String(row.price),
    quantity: Number(row.quantity),
    traded_at: new Date(row.traded_at).toISOString(),
  }));

  return {
    sku,
    card_name: cardInfo.rows[0]?.card_name || null,
    image_url: cardInfo.rows[0]?.image_url || null,
    bids,
    asks,
    recent_trades: recentTrades,
    best_bid: bids.length > 0 ? bids[0].price : null,
    best_ask: asks.length > 0 ? asks[0].price : null,
  };
}

// ── Browse: cards with active order books ──

export async function getMarketSummaries(filters: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ cards: OrderBookSummary[]; total: number }> {
  void filters;
  return { cards: [], total: 0 };
}

// ── User's orders ──

export async function getUserOrders(userId: string, status?: string): Promise<MarketOrder[]> {
  await sweepExpiredBestEffort();
  const params: unknown[] = [userId];
  let where = "WHERE user_id = $1";
  if (status === "open") {
    where += " AND status IN ('open', 'partially_filled')";
  } else if (status === "filled") {
    where += " AND status = 'filled'";
  }

  const result = await query(
    `SELECT * FROM market_orders ${where} ORDER BY created_at DESC`,
    params
  );
  return result.rows as MarketOrder[];
}

// ── User's trades ──

export async function getUserTrades(userId: string): Promise<MarketTrade[]> {
  await sweepExpiredBestEffort();
  // No counterparty emails here — usernames + user ids are what the
  // parties get; contact goes through platform messaging (global free
  // trade §2.3). buyer_id/seller_id ride along via t.*.
  const result = await query(
    `SELECT t.*,
       bu.name as buyer_name, bu.username as buyer_username,
       su.name as seller_name, su.username as seller_username,
       o.card_name, o.image_url
     FROM market_trades t
     LEFT JOIN users bu ON t.buyer_id = bu.id
     LEFT JOIN users su ON t.seller_id = su.id
     LEFT JOIN market_orders o ON t.bid_order_id = o.id
     WHERE t.buyer_id = $1 OR t.seller_id = $1
     ORDER BY t.created_at DESC`,
    [userId]
  );
  return result.rows as MarketTrade[];
}

// ── Admin: all trades ──

export async function getAllTrades(escrowStatus?: string): Promise<MarketTrade[]> {
  const params: unknown[] = [];
  let where = "";
  if (escrowStatus) {
    params.push(escrowStatus);
    where = `WHERE t.escrow_status = $1`;
  }

  const result = await query(
    `SELECT t.*,
       bu.name as buyer_name, bu.email as buyer_email,
       su.name as seller_name, su.email as seller_email,
       o.card_name, o.image_url
     FROM market_trades t
     LEFT JOIN users bu ON t.buyer_id = bu.id
     LEFT JOIN users su ON t.seller_id = su.id
     LEFT JOIN market_orders o ON t.bid_order_id = o.id
     ${where}
     ORDER BY t.created_at DESC`,
    params
  );
  return result.rows as MarketTrade[];
}

// ── Admin: update escrow status ──

export async function updateEscrowStatus(tradeId: string, status: string, data?: {
  trackingToCtcg?: string;
  trackingToBuyer?: string;
  /** Carrier for the buyer-bound leg (migration 0108) — its own column
   *  so tracking links stay derivable via lib/shipping/carriers.ts. */
  carrier?: string;
  adminNotes?: string;
  /** Identity of the caller for the lifecycle log row. Optional —
   *  cron sweeps and system flows pass actorLabel only; user-driven
   *  flows pass actorId. */
  actorId?: string | null;
  actorLabel?: string | null;
  reason?: string | null;
}): Promise<MarketTrade | null> {
  const timestampField: Record<string, string> = {
    paid: "buyer_paid_at",
    shipped_to_ctcg: "seller_shipped_at",
    received_by_ctcg: "ctcg_received_at",
    verified: "ctcg_verified_at",
    shipped_to_buyer: "shipped_to_buyer_at",
    completed: "completed_at",
  };

  const fields = [`escrow_status = $1`, `updated_at = NOW()`];
  const values: unknown[] = [status];
  let idx = 2;

  if (timestampField[status]) {
    fields.push(`${timestampField[status]} = NOW()`);
  }
  if (status === "completed") {
    // Every completion through this path is admin-mediated (trades PATCH,
    // dispute resolution). The buyer-confirm route and the auto-window
    // sweep write their own stamps in lib/market/completion.ts.
    fields.push(`completed_via = COALESCE(completed_via, 'admin')`);
  }
  if (data?.trackingToCtcg) {
    fields.push(`tracking_to_ctcg = $${idx++}`);
    values.push(data.trackingToCtcg);
  }
  if (data?.trackingToBuyer) {
    fields.push(`tracking_to_buyer = $${idx++}`);
    values.push(data.trackingToBuyer);
  }
  if (data?.carrier) {
    fields.push(`carrier = $${idx++}`);
    values.push(data.carrier);
  }
  if (data?.adminNotes) {
    fields.push(`admin_notes = $${idx++}`);
    values.push(data.adminNotes);
  }

  values.push(tradeId);
  const result = await query(
    `UPDATE market_trades SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
    values
  );
  const trade = (result.rows[0] as MarketTrade) ?? null;

  // Status-transition notifications. Fire-and-forget; failures don't block
  // the admin's update.
  if (trade) {
    notifyTradeStatusChange(trade).catch((err) =>
      console.error("[market] Status email failed:", err)
    );

    // Lifecycle log + trust recompute. Mirrors the auction module:
    // every escrow flip lands one row, terminal flips also recompute
    // trust scores for both parties (completed lifts both, disputed/
    // refunded reflect on whichever party is at fault — the engine
    // reads the trust history itself, so just trigger a recompute).
    void import("./lifecycle-log").then(({ logTradeTransition }) =>
      logTradeTransition({
        tradeId,
        action: status as never,
        actorId: data?.actorId ?? null,
        actorLabel: data?.actorLabel ?? null,
        reason: data?.reason ?? null,
        metadata: {
          tracking_to_ctcg: data?.trackingToCtcg ?? null,
          tracking_to_buyer: data?.trackingToBuyer ?? null,
          admin_notes: data?.adminNotes ?? null,
        },
      }),
    );
    if (status === "completed" || status === "refunded" || status === "cancelled") {
      void import("@/lib/escrow/trust-engine").then(async ({ calculateTrustScore }) => {
        await calculateTrustScore(trade.buyer_id).catch(() => { /* ignore */ });
        await calculateTrustScore(trade.seller_id).catch(() => { /* ignore */ });
      });
    }

    if (status === "completed") {
      recordCompletedTradePortfolio(trade);
    }
  }

  return trade;
}

// Investor-grade portfolio side-effect on completion: the buyer's
// portfolio acquires the card at the trade price; the seller's
// realizes a P&L row at the proceeds (net of commission). On
// refund we DO NOT auto-reverse — investors should review and
// manually adjust because the basis math depends on whether they
// ever physically received the card. Refunds are rare enough that
// a manual touch is fine.
//
// Fire-and-forget. Shared by every completion path: admin (via
// updateEscrowStatus above), buyer confirm, and the auto-window sweep
// (both in lib/market/completion.ts). Both portfolio writes are keyed
// on the trade id downstream, so a duplicate call is a no-op.
export function recordCompletedTradePortfolio(trade: MarketTrade): void {
  void import("@/lib/portfolio/realize").then(async ({ recordAcquisition, closePosition }) => {
    const sellerProceeds = parseFloat(trade.seller_payout);
    const fees = parseFloat(trade.commission_amount);
    const tradeValue = parseFloat(trade.price) * trade.quantity;
    // Card metadata: pull from the ask order (seller's listing)
    // so we get the rich card_name / set_code snapshot.
    const meta = await query(
      `SELECT card_name, image_url, set_code, set_name, rarity, card_number
         FROM market_orders WHERE id = $1`,
      [trade.ask_order_id],
    ).catch(() => ({ rows: [] as Record<string, string | null>[] }));
    const m = meta.rows[0] ?? {};
    await recordAcquisition({
      userId: trade.buyer_id,
      sku: trade.sku,
      cardName: m.card_name ?? undefined,
      imageUrl: m.image_url ?? undefined,
      setCode: m.set_code ?? undefined,
      setName: m.set_name ?? undefined,
      rarity: m.rarity ?? undefined,
      cardNumber: m.card_number ?? undefined,
      quantity: trade.quantity,
      pricePaidGbp: tradeValue,
      acquisitionSource: "market_trade",
      acquisitionReferenceId: trade.id,
    }).catch((err) => console.error("[portfolio/auto-acquire] failed:", err));
    await closePosition({
      userId: trade.seller_id,
      sku: trade.sku,
      quantity: trade.quantity,
      proceedsGbp: tradeValue,
      feesGbp: fees,
      exitKind: "market_trade",
      exitReferenceId: trade.id,
      notes: `Sold via market trade · gross £${tradeValue.toFixed(2)} · fees £${fees.toFixed(2)} · net £${sellerProceeds.toFixed(2)}`,
    }).catch((err) => console.error("[portfolio/realize] failed:", err));
  });
}

// Exported for lib/market/completion.ts — the buyer-confirm and
// auto-window paths reuse the same email + in-app matrix so a
// 'completed' transition reads identically however it happened.
export async function notifyTradeStatusChange(trade: MarketTrade): Promise<void> {
  // Only send for transitions that the parties care about — skip noisy
  // intermediate states like "received_by_ctcg" that the buyer doesn't need.
  // "paid" is included because the seller explicitly cares that money
  // has landed; they were otherwise blind.
  const relevant = new Set(["paid", "shipped_to_ctcg", "verified", "shipped_to_buyer", "completed", "disputed", "refunded"]);
  if (!relevant.has(trade.escrow_status)) return;

  const { sendStatusEmail } = await import("./email");

  const info = await query(
    `SELECT bu.id AS buyer_id, bu.email AS buyer_email,
            su.id AS seller_id, su.email AS seller_email,
            COALESCE(o.card_name, t.sku) AS card_name
       FROM market_trades t
       JOIN users bu ON bu.id = t.buyer_id
       JOIN users su ON su.id = t.seller_id
       LEFT JOIN market_orders o ON o.id = t.bid_order_id
      WHERE t.id = $1`,
    [trade.id]
  );
  if (info.rows.length === 0) return;
  const { buyer_id, buyer_email, seller_id, seller_email, card_name } = info.rows[0];

  type Msg = { to: string; subject: string; heading: string; body: string };
  const messages: Msg[] = [];

  switch (trade.escrow_status) {
    case "paid":
      // Seller-focused: payment has landed, get ready to ship.
      messages.push({
        to: seller_email, subject: `Payment received for ${card_name}`,
        heading: "Buyer has paid — ready to ship",
        body: `Payment for <strong>${card_name}</strong> has landed. You can now ship the card${trade.seller_ships_to === "ctcg" ? " to Cambridge TCG for verification" : " directly to the buyer"}.`,
      });
      break;
    case "shipped_to_ctcg":
      messages.push({
        to: buyer_email, subject: `Seller shipped your card to us`,
        heading: "Card on its way to Cambridge TCG",
        body: `The seller has shipped <strong>${card_name}</strong> to us for verification. We'll inspect it and forward it to you.`,
      });
      break;
    case "verified":
      messages.push({
        to: buyer_email, subject: `${card_name} verified — shipping to you next`,
        heading: "Card verified by Cambridge TCG",
        body: `We've inspected and verified <strong>${card_name}</strong>. Shipping it to you next.`,
      });
      break;
    case "shipped_to_buyer": {
      const tracking = trade.tracking_to_buyer ? ` Tracking: <strong>${trade.tracking_to_buyer}</strong>.` : "";
      messages.push({
        to: buyer_email, subject: `${card_name} is on its way`,
        heading: "Your card has shipped",
        body: `<strong>${card_name}</strong> is on its way to you.${tracking}`,
      });
      break;
    }
    case "completed":
      messages.push(
        { to: buyer_email, subject: `Trade complete: ${card_name}`,
          heading: "Trade complete", body: `Your trade for <strong>${card_name}</strong> is complete. Thanks for trading on Cambridge TCG.` },
        { to: seller_email, subject: `Trade complete: ${card_name}`,
          heading: "Trade complete — payout released",
          body: `Trade for <strong>${card_name}</strong> is complete. Your payout of <strong>£${trade.seller_payout}</strong> will be released after the payout-hold window.` }
      );
      break;
    case "disputed":
      messages.push(
        { to: buyer_email, subject: `Dispute opened: ${card_name}`, heading: "Dispute opened", body: `A dispute has been opened on your trade for <strong>${card_name}</strong>. We'll be in touch.` },
        { to: seller_email, subject: `Dispute opened: ${card_name}`, heading: "Dispute opened", body: `A dispute has been opened on your sale of <strong>${card_name}</strong>. We'll be in touch.` }
      );
      break;
    case "refunded":
      messages.push({
        to: buyer_email, subject: `Refund issued: ${card_name}`,
        heading: "Refund issued",
        body: `A refund has been issued for your trade of <strong>${card_name}</strong>.`,
      });
      break;
  }

  // Fire emails fire-and-forget — SES timeouts (up to 30s on bad
  // creds) must NOT block the in-app notify loop below. Local DB
  // writes are fast and the bell needs to reflect the transition
  // immediately, regardless of email delivery.
  Promise.allSettled(
    messages.map((m) =>
      sendStatusEmail({ email: m.to, cardName: card_name, subject: m.subject, heading: m.heading, body: m.body })
    )
  ).catch(() => {});

  // In-app notifications mirror the email matrix above so the bell
  // reflects every transition the user gets emailed about. Dedup on
  // (trade_id:status) keeps admin re-saves idempotent.
  type InApp = { userId: string; title: string; body?: string };
  const inApp: InApp[] = [];
  switch (trade.escrow_status) {
    case "paid":
      inApp.push({ userId: seller_id, title: `Payment received for ${card_name}`,
        body: "Buyer has paid. Time to ship." });
      break;
    case "shipped_to_ctcg":
      inApp.push({ userId: buyer_id, title: `${card_name} is on its way to Cambridge TCG`,
        body: "We'll inspect the card and forward it to you." });
      break;
    case "verified":
      inApp.push({ userId: buyer_id, title: `${card_name} verified — shipping to you next`,
        body: "Cambridge TCG has verified the card. It's heading your way." });
      break;
    case "shipped_to_buyer":
      inApp.push({ userId: buyer_id, title: `${card_name} has shipped to you`,
        body: trade.tracking_to_buyer ? `Tracking: ${trade.tracking_to_buyer}` : undefined });
      break;
    case "completed":
      inApp.push(
        { userId: buyer_id, title: `Trade complete: ${card_name}` },
        { userId: seller_id, title: `Trade complete: ${card_name} — payout £${trade.seller_payout}` },
      );
      break;
    case "disputed":
      inApp.push(
        { userId: buyer_id, title: `Dispute opened on ${card_name}` },
        { userId: seller_id, title: `Dispute opened on ${card_name}` },
      );
      break;
    case "refunded":
      inApp.push({ userId: buyer_id, title: `Refund issued for ${card_name}` });
      break;
  }

  for (const n of inApp) {
    await notify({
      userId: n.userId,
      kind: `market.${trade.escrow_status}`,
      title: n.title,
      body: n.body,
      linkUrl: "/account/trades",
      referenceType: "market_trade",
      referenceId: `${trade.id}:${trade.escrow_status}`,
    });
  }
}

// ── Trade photos (verified / full_escrow tiers) ──

export interface TradePhoto {
  id: string;
  trade_id: string;
  uploaded_by: string;
  url: string;
  s3_key: string;
  photo_type: string;
  approved: boolean | null;
  reviewed_at: string | null;
  created_at: string;
}

// Returns { sellerId, buyerId } so callers can authorize seller-only or
// participant-or-admin actions without re-querying.
export async function getTradeParticipants(tradeId: string): Promise<{
  sellerId: string; buyerId: string; escrowStatus: string;
} | null> {
  const r = await query(
    `SELECT seller_id, buyer_id, escrow_status FROM market_trades WHERE id = $1`,
    [tradeId]
  );
  if (r.rows.length === 0) return null;
  return {
    sellerId: r.rows[0].seller_id,
    buyerId: r.rows[0].buyer_id,
    escrowStatus: r.rows[0].escrow_status,
  };
}

export async function addTradePhoto(data: {
  tradeId: string;
  uploadedBy: string;
  url: string;
  s3Key: string;
  photoType?: string;
}): Promise<TradePhoto> {
  const r = await query(
    `INSERT INTO trade_photos (trade_id, uploaded_by, url, s3_key, photo_type)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [data.tradeId, data.uploadedBy, data.url, data.s3Key, data.photoType || "card"]
  );
  return r.rows[0] as TradePhoto;
}

export async function listTradePhotos(tradeId: string): Promise<TradePhoto[]> {
  const r = await query(
    `SELECT * FROM trade_photos WHERE trade_id = $1 ORDER BY created_at ASC`,
    [tradeId]
  );
  return r.rows as TradePhoto[];
}

export async function reviewTradePhoto(photoId: string, approved: boolean): Promise<TradePhoto | null> {
  const r = await query(
    `UPDATE trade_photos SET approved = $2, reviewed_at = NOW()
      WHERE id = $1 RETURNING *`,
    [photoId, approved]
  );
  return (r.rows[0] as TradePhoto) ?? null;
}

export async function deleteTradePhoto(photoId: string): Promise<string | null> {
  const r = await query(`DELETE FROM trade_photos WHERE id = $1 RETURNING s3_key`, [photoId]);
  return r.rows[0]?.s3_key ?? null;
}

// ── Manual payout recording (provider-agnostic) ──
// Admin-only path. Records that the seller has been paid. For most methods
// this is just a bookkeeping stamp — admin moved money in their own
// dashboard. For method='stripe_connect' we actually call stripe.transfers
// to send the funds, then stamp the row with the transfer id.
//
// Refuses to record a payout twice. Refuses to record before the trade is
// completed (so admin doesn't accidentally pay before fulfillment).
export async function recordTradePayout(data: {
  tradeId: string;
  method: string;        // bank_transfer | paypal | crypto | stripe_connect | store_credit | other
  reference?: string;    // provider txn id, bank ref, etc. Free-form.
}): Promise<{ ok: true; transferId?: string } | { ok: false; error: string }> {
  const tradeRes = await query(
    `SELECT t.escrow_status, t.seller_paid_at, t.seller_payout, t.seller_id,
            su.email AS seller_email,
            COALESCE(o.card_name, t.sku) AS card_name
       FROM market_trades t
       JOIN users su ON su.id = t.seller_id
       LEFT JOIN market_orders o ON o.id = t.bid_order_id
      WHERE t.id = $1`,
    [data.tradeId]
  );
  if (tradeRes.rows.length === 0) return { ok: false, error: "Trade not found." };
  const trade = tradeRes.rows[0];

  if (trade.seller_paid_at) {
    return { ok: false, error: "Payout already recorded for this trade." };
  }
  if (trade.escrow_status !== "completed") {
    return { ok: false, error: `Cannot pay seller until trade is completed (currently ${trade.escrow_status}).` };
  }

  // For Stripe Connect we make the actual transfer here. If it fails the row
  // stays unstamped and admin can retry. The reference is the transfer id;
  // any admin-supplied reference is appended into the metadata description.
  let transferId: string | undefined;
  let storedReference = data.reference || null;
  if (data.method === "stripe_connect") {
    try {
      const { createTransferToSeller } = await import("@/lib/payouts/stripe-connect");
      const result = await createTransferToSeller({
        sellerUserId: trade.seller_id,
        amountGbp: parseFloat(trade.seller_payout),
        description: `Payout for trade ${data.tradeId} (${trade.card_name})`,
        idempotencyKey: `payout-trade-${data.tradeId}`,
        metadata: { tradeId: data.tradeId, kind: "market_trade" },
      });
      transferId = result.transferId;
      storedReference = transferId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Stripe transfer failed";
      return { ok: false, error: msg };
    }
  }

  // Atomic re-check: the seller_paid_at read above is stale by now, so the
  // stamp itself carries the guard. Zero rows = a concurrent caller already
  // recorded the payout (Stripe transfers stay single via the idempotency key).
  const stamped = await query(
    `UPDATE market_trades
        SET seller_paid_at = NOW(),
            payout_method = $2,
            payout_reference = $3,
            stripe_transfer_id = $4,
            updated_at = NOW()
      WHERE id = $1 AND seller_paid_at IS NULL
      RETURNING id`,
    [data.tradeId, data.method, storedReference, transferId || null]
  );
  if (stamped.rows.length === 0) {
    return { ok: false, error: "Payout already recorded for this trade." };
  }

  // Receipt to the seller (fire-and-forget)
  const { sendPayoutEmail } = await import("./email");
  const { formatPrice } = await import("@/lib/format");
  sendPayoutEmail({
    email: trade.seller_email,
    cardName: trade.card_name,
    amount: formatPrice(parseFloat(trade.seller_payout)),
    method: data.method,
    reference: storedReference,
  }).catch((err) => console.error("[market] Payout email failed:", err));

  // In-app notification mirrors the email. The duplicate-payout guard
  // above (seller_paid_at IS NULL) already prevents this from firing
  // twice; the dedup key is belt-and-braces for retries from the cron.
  await notify({
    userId: trade.seller_id,
    kind: "payout.released",
    title: `Payout released: ${formatPrice(parseFloat(trade.seller_payout))} for ${trade.card_name}`,
    body: data.method === "stripe_connect"
      ? "Funds are on their way to your Stripe account. Stripe usually clears within 1-2 business days."
      : `Paid via ${data.method.replace(/_/g, " ")}.`,
    linkUrl: "/account/payouts",
    referenceType: "market_trade_payout",
    referenceId: data.tradeId,
  });

  return { ok: true, transferId };
}

// Best-effort sweep wrapper used by read paths. Logs and swallows errors
// so a partial sweep failure never 500s a market detail page.
async function sweepExpiredBestEffort(force = false): Promise<void> {
  try {
    await sweepExpired(force);
  } catch (err) {
    console.error("[market/sweep] swallowed in read path:", err);
  }
}

// ── Cron entry point ──
// Bypasses the in-process throttle so the scheduled sweep always runs even
// if a recent read already triggered one in this lambda instance.
export async function runMarketMaintenance(): Promise<void> {
  await sweepExpired(true);
}
