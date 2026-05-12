// Make-an-offer / counter-offer lib.
//
// Sits between market_orders and market_trades: a buyer proposes a
// price against an existing ask, the seller accepts/declines/counters,
// and (eventually) acceptance creates a market_trade row that the
// existing trade lifecycle takes over.
//
// All state-mutating functions return the same discriminated-union
// shape the rest of the codebase uses:
//   { ok: true, ... } | { ok: false, reason, status }
// The route handler maps `status` to the HTTP status code.
//
// Notification dedup keys: <offerId>:<status>. Mirrors the (trade:role)
// pattern used by the market notifications arc.

import { query } from "@/lib/db";
import { notify } from "@/lib/notifications/db";
import { canTrade } from "@/lib/escrow/trust-engine";
import { formatPrice } from "@/lib/format";
import { paymentExpiresAtForBuyer } from "@/lib/users/response-window";
import type { MarketTrade } from "./types";
import type { OfferStatus } from "./offer-timeline";
import { logOfferTransition } from "./offer-lifecycle-log";
import { logTradeTransition } from "./lifecycle-log";

export interface MarketOffer {
  id: string;
  ask_order_id: string;
  buyer_id: string;
  seller_id: string;
  offer_price: string;
  quantity: number;
  message: string | null;
  status: OfferStatus;
  counter_price: string | null;
  counter_message: string | null;
  created_at: string;
  responded_at: string | null;
  resolved_at: string | null;
  expires_at: string;
  trade_id: string | null;
  // Joined for list pages
  card_name?: string | null;
  sku?: string;
  ask_price?: string;
  buyer_username?: string | null;
  buyer_name?: string | null;
  seller_username?: string | null;
  seller_name?: string | null;
}

type Result<T> = { ok: true; value: T } | { ok: false; reason: string; status: number };

// Per-seller offer-response window. The seller's `response_window_hours`
// (migration 0092, the Asynchronous's column) governs how long they have
// to accept / decline / counter an offer before it auto-expires. Default
// 48h preserves the historical platform constant for every user who
// hasn't explicitly declared a slower cadence.
//
// See `docs/methodology/response-windows.md` for the customer-facing
// recipe; `docs/connections/the-other-minds.md` (the Asynchronous) for
// the architectural framing; `pnpm audit:inclusion` for adoption.
const DEFAULT_OFFER_TTL_HOURS = 48;

async function offerTtlMsForSeller(sellerId: string): Promise<number> {
  const r = await query(
    `SELECT response_window_hours FROM users WHERE id = $1`,
    [sellerId],
  );
  const hours =
    (r.rows[0]?.response_window_hours as number | undefined) ?? DEFAULT_OFFER_TTL_HOURS;
  return hours * 60 * 60 * 1000;
}

// Buyer's payment-deadline window after an offer is accepted. The
// Asynchronous's column applies on this side too: a buyer who has
// declared a 168h cadence gets that window to pay; the platform's
// historical 24h default applies for everyone who hasn't.
//
// Wave 2 of the All-Aboard plan (kingdom-051). Replaces the two literal
// NOW-plus-24h writes below with a buyer-aware ISO timestamp computed
// via the shared `@/lib/users/response-window` helper.
const DEFAULT_PAYMENT_WINDOW_HOURS = 24;

// ── Internal: fetch + lock the offer for a state-mutating call ──
// Returns the row or a typed error so callers don't need to repeat
// the not-found / wrong-state plumbing.
async function loadOffer(offerId: string): Promise<MarketOffer | null> {
  const r = await query(
    `SELECT o.*, mo.sku, mo.card_name, mo.price AS ask_price
       FROM market_offers o
       JOIN market_orders mo ON mo.id = o.ask_order_id
      WHERE o.id = $1`,
    [offerId],
  );
  return (r.rows[0] as MarketOffer) ?? null;
}

// ── Create an offer (buyer-initiated) ──
export async function makeOffer(input: {
  buyerId: string;
  askOrderId: string;
  offerPrice: number;
  quantity?: number;
  message?: string;
}): Promise<Result<MarketOffer>> {
  // Validate the ask exists, is offerable, and isn't the buyer's own.
  const askRows = await query(
    `SELECT id, user_id, sku, price, quantity, filled_quantity, condition,
            card_name, status, allow_offers
       FROM market_orders WHERE id = $1`,
    [input.askOrderId],
  );
  if (askRows.rows.length === 0) {
    return { ok: false, reason: "Ask not found.", status: 404 };
  }
  const ask = askRows.rows[0];
  if (ask.user_id === input.buyerId) {
    return { ok: false, reason: "You can't offer on your own ask.", status: 400 };
  }
  if (ask.status !== "open" && ask.status !== "partially_filled") {
    return { ok: false, reason: `Ask is ${ask.status} — no longer accepting offers.`, status: 409 };
  }
  if (!ask.allow_offers) {
    return { ok: false, reason: "This seller doesn't accept offers on this listing.", status: 403 };
  }

  const qty = input.quantity ?? 1;
  if (qty < 1 || qty > ask.quantity - ask.filled_quantity) {
    return {
      ok: false,
      reason: `Quantity must be 1-${ask.quantity - ask.filled_quantity}.`,
      status: 400,
    };
  }
  if (input.offerPrice <= 0 || input.offerPrice > parseFloat(ask.price)) {
    // Offers above the ask price are rejected — the buyer should just
    // hit Buy Now in that case. Equal-to-ask is technically also a
    // no-op, but we accept it (some buyers want a paper trail).
    return {
      ok: false,
      reason: `Offer must be between £0.01 and the ask price (£${ask.price}).`,
      status: 400,
    };
  }

  // Trust gate at the offer-value, not the ask-value — a £200 offer
  // is gated even if the ask was £500.
  const orderValue = input.offerPrice * qty;
  const gate = await canTrade(input.buyerId, orderValue);
  if (!gate.allowed) {
    return { ok: false, reason: gate.reason ?? "Trust gate rejected.", status: 403 };
  }

  // Soft cap: at most 5 simultaneous pending offers per ask, to keep
  // a popular listing from accumulating spam offers the seller has
  // to triage.
  const pending = await query(
    `SELECT COUNT(*)::int AS n FROM market_offers
      WHERE ask_order_id = $1 AND status = 'pending'`,
    [input.askOrderId],
  );
  if (pending.rows[0].n >= 5) {
    return {
      ok: false,
      reason: "This ask has the maximum number of open offers — try again later.",
      status: 429,
    };
  }

  // Same buyer can't have two pending offers on the same ask.
  const existing = await query(
    `SELECT id FROM market_offers
      WHERE ask_order_id = $1 AND buyer_id = $2 AND status IN ('pending', 'countered')`,
    [input.askOrderId, input.buyerId],
  );
  if (existing.rows.length > 0) {
    return {
      ok: false,
      reason: "You already have an open offer on this ask. Withdraw it before submitting a new one.",
      status: 409,
    };
  }

  // Resolve the seller's response window. A seller who has declared a
  // slow-clock cadence (e.g. 168h for "a week") gets a longer offer
  // TTL; the buyer's UI shows the actual `expires_at`, so the gap is
  // visible. Default 48h matches the historical platform constant.
  const ttlMs = await offerTtlMsForSeller(ask.user_id);
  const ttlHours = Math.round(ttlMs / (60 * 60 * 1000));
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const inserted = await query(
    `INSERT INTO market_offers
       (ask_order_id, buyer_id, seller_id, offer_price, quantity, message, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [input.askOrderId, input.buyerId, ask.user_id,
     input.offerPrice.toFixed(2), qty, input.message?.trim() || null, expiresAt],
  );
  const offer = inserted.rows[0] as MarketOffer;

  // Notify the seller. Buyer name resolved for the title.
  const buyerRow = await query(
    `SELECT username, name FROM users WHERE id = $1`,
    [input.buyerId],
  );
  const buyer = buyerRow.rows[0];
  const buyerLabel = buyer?.username ? `@${buyer.username}` : (buyer?.name || "A buyer");
  const windowLabel = ttlHours === DEFAULT_OFFER_TTL_HOURS
    ? "48h"
    : ttlHours % 24 === 0
      ? `${ttlHours / 24} day${ttlHours === 24 ? "" : "s"}`
      : `${ttlHours}h`;
  await notify({
    userId: ask.user_id,
    kind: "offer.received",
    title: `${buyerLabel} offered ${formatPrice(input.offerPrice)} on ${ask.card_name || ask.sku}`,
    body: input.message
      ? input.message.slice(0, 160)
      : `Your ask was ${formatPrice(parseFloat(ask.price))}. You have ${windowLabel} to respond.`,
    linkUrl: "/account/offers",
    referenceType: "market_offer",
    referenceId: `${offer.id}:received`,
  });

  // Lifecycle row — anchors the audit chain. The lowball-abuse
  // detector below reads from this log so the row needs to land
  // before the rule engine fires.
  void logOfferTransition({
    offerId: offer.id,
    action: "created",
    actorId: input.buyerId,
    actorLabel: "buyer",
    reason: input.message?.slice(0, 200) || null,
    metadata: {
      ask_id: input.askOrderId,
      ask_price: ask.price,
      offer_price: input.offerPrice.toFixed(2),
      quantity: qty,
      offer_pct_of_ask: ask.price ? Math.round((input.offerPrice / parseFloat(ask.price)) * 100) : null,
    },
  });

  // Lowball-abuse detector — fire-and-forget. Pattern: ≥10 offers in
  // 7d where price ≤ 30% of ask. Same shape as the cancel-abuse and
  // trade-default detectors; lands a flag for admin review.
  void detectOfferLowballAbuse(input.buyerId).catch((err) =>
    console.error("[offers] lowball detection failed:", err),
  );

  // Pricing rules hook. Evaluates the seller's active rules against
  // this fresh offer; if any match the listing-filter and find the
  // offer below threshold, auto-declines or auto-counters by calling
  // back through declineOffer / counterOffer. The buyer's bell shows
  // the resulting offer.declined or offer.countered notification —
  // not a separate kind. Lazy-imported to keep the offers ↔ rules
  // dependency edge one-way at module-load time.
  try {
    const { applyRulesToOffer } = await import("./pricing-rules");
    await applyRulesToOffer({
      offerId: offer.id,
      sellerId: ask.user_id,
      askId: input.askOrderId,
      offerPrice: input.offerPrice,
    });
  } catch (err) {
    // Rule evaluation must never fail the offer creation. The offer
    // sits in 'pending' and the seller gets to triage manually.
    console.error("[offers] rule evaluation failed:", err);
  }

  return { ok: true, value: offer };
}

// ── Seller actions: accept / decline / counter ──

export async function acceptOffer(offerId: string, sellerId: string): Promise<Result<{
  offer: MarketOffer;
  trade: MarketTrade;
}>> {
  const offer = await loadOffer(offerId);
  if (!offer) return { ok: false, reason: "Offer not found.", status: 404 };
  if (offer.seller_id !== sellerId) {
    return { ok: false, reason: "Not your offer to accept.", status: 403 };
  }
  if (offer.status !== "pending") {
    return { ok: false, reason: `Offer is ${offer.status} — can't accept.`, status: 409 };
  }

  // Create the trade at the offer price by reusing placeOrder's
  // engine? No — we already have a matching pair of orders (the ask
  // exists; we synthesize a bid for record-keeping then INSERT trade
  // directly). Going through placeOrder would re-run the trust gate
  // unnecessarily (already checked at offer creation) and could
  // mis-match against a different cheaper ask in the meantime.
  const askRows = await query(
    `SELECT id, sku, condition, price, quantity, filled_quantity, user_id, card_name
       FROM market_orders WHERE id = $1 FOR UPDATE`,
    [offer.ask_order_id],
  );
  if (askRows.rows.length === 0 || askRows.rows[0].user_id !== sellerId) {
    return { ok: false, reason: "Ask is no longer available.", status: 409 };
  }
  const ask = askRows.rows[0];
  const remaining = ask.quantity - ask.filled_quantity;
  if (remaining < offer.quantity) {
    return { ok: false, reason: "Not enough remaining qty on the ask.", status: 409 };
  }

  // Synthesize a 'bid' order so market_trades's bid_order_id FK is
  // satisfied. Marked filled immediately — it's a paper trail for
  // the offer-driven match, not an order on the book.
  const synthBid = await query(
    `INSERT INTO market_orders
       (user_id, side, sku, card_name, condition, price, quantity, status,
        filled_quantity, allow_offers)
     VALUES ($1, 'bid', $2, $3, $4, $5, $6, 'filled', $6, false)
     RETURNING id`,
    [offer.buyer_id, ask.sku, ask.card_name, ask.condition,
     offer.offer_price, offer.quantity],
  );

  // Compute commission off the OFFER price (not the ask price).
  const offerValue = parseFloat(offer.offer_price) * offer.quantity;
  const commission = Math.round(offerValue * 0.08 * 100) / 100;
  const sellerPayout = offerValue - commission;

  const paymentExpiresAt = await paymentExpiresAtForBuyer(offer.buyer_id, DEFAULT_PAYMENT_WINDOW_HOURS);
  const tradeRow = await query(
    `INSERT INTO market_trades
       (bid_order_id, ask_order_id, buyer_id, seller_id, sku, price, quantity,
        commission_amount, seller_payout, escrow_status, payment_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'awaiting_payment',
             $10::timestamptz)
     RETURNING *`,
    [synthBid.rows[0].id, ask.id, offer.buyer_id, sellerId,
     ask.sku, offer.offer_price, offer.quantity,
     commission.toFixed(2), sellerPayout.toFixed(2), paymentExpiresAt],
  );
  const trade = tradeRow.rows[0] as MarketTrade;

  // Update ask filled_quantity. Cast to order_status — the literal
  // 'filled'/'partially_filled' would otherwise be inferred as text
  // and PG rejects the assignment.
  await query(
    `UPDATE market_orders
        SET filled_quantity = filled_quantity + $2,
            status = (CASE WHEN filled_quantity + $2 >= quantity THEN 'filled'
                          ELSE 'partially_filled' END)::order_status,
            updated_at = NOW()
      WHERE id = $1`,
    [ask.id, offer.quantity],
  );

  // Mark offer accepted + link trade
  await query(
    `UPDATE market_offers
        SET status='accepted', responded_at=NOW(), resolved_at=NOW(),
            trade_id=$2, updated_at=NOW()
      WHERE id=$1`,
    [offerId, trade.id],
  );

  // Notify the buyer to pay. The market trade's existing 24h
  // payment-window notify will ALSO fire from placeOrder's match
  // path — but since we bypassed placeOrder, fire the equivalent
  // here. (kind=offer.accepted distinguishes from organic match.)
  await notify({
    userId: offer.buyer_id,
    kind: "offer.accepted",
    title: `Offer accepted: ${formatPrice(parseFloat(offer.offer_price))} for ${ask.card_name || ask.sku}`,
    body: "Pay within 24 hours to lock in the trade.",
    linkUrl: "/account/trades",
    referenceType: "market_offer",
    referenceId: `${offerId}:accepted`,
  });

  // Lifecycle: offer accepted → trade created. Two rows because the
  // trade was INSERTed directly (bypassing placeOrder, which would
  // have written its own "created" row).
  void logOfferTransition({
    offerId,
    action: "accepted",
    actorId: sellerId,
    actorLabel: "seller",
    reason: `Accepted at ${formatPrice(parseFloat(offer.offer_price))}`,
    metadata: { trade_id: trade.id, accepted_price: offer.offer_price },
  });
  void logTradeTransition({
    tradeId: trade.id,
    action: "created",
    actorId: sellerId,
    actorLabel: "seller:offer-accept",
    reason: `Offer ${offerId} accepted`,
    metadata: { offer_id: offerId, sku: trade.sku, price: trade.price, quantity: trade.quantity },
  });

  const updated = await loadOffer(offerId);
  return { ok: true, value: { offer: updated!, trade } };
}

export async function declineOffer(
  offerId: string, sellerId: string, reason?: string,
): Promise<Result<MarketOffer>> {
  const offer = await loadOffer(offerId);
  if (!offer) return { ok: false, reason: "Offer not found.", status: 404 };
  if (offer.seller_id !== sellerId) {
    return { ok: false, reason: "Not your offer to decline.", status: 403 };
  }
  if (offer.status !== "pending" && offer.status !== "countered") {
    return { ok: false, reason: `Offer is ${offer.status} — can't decline.`, status: 409 };
  }

  await query(
    `UPDATE market_offers
        SET status='declined', responded_at=COALESCE(responded_at, NOW()),
            resolved_at=NOW(), updated_at=NOW()
      WHERE id=$1`,
    [offerId],
  );

  await notify({
    userId: offer.buyer_id,
    kind: "offer.declined",
    title: `Offer declined: ${formatPrice(parseFloat(offer.offer_price))} for ${offer.card_name || offer.sku}`,
    body: reason?.slice(0, 200) ?? "The seller didn't accept your offer.",
    linkUrl: "/account/offers",
    referenceType: "market_offer",
    referenceId: `${offerId}:declined`,
  });

  void logOfferTransition({
    offerId,
    action: "declined",
    actorId: sellerId,
    actorLabel: "seller",
    reason: reason?.slice(0, 500) || "Seller declined",
  });

  return { ok: true, value: (await loadOffer(offerId))! };
}

export async function counterOffer(input: {
  offerId: string;
  sellerId: string;
  counterPrice: number;
  counterMessage?: string;
}): Promise<Result<MarketOffer>> {
  const offer = await loadOffer(input.offerId);
  if (!offer) return { ok: false, reason: "Offer not found.", status: 404 };
  if (offer.seller_id !== input.sellerId) {
    return { ok: false, reason: "Not your offer to counter.", status: 403 };
  }
  if (offer.status !== "pending") {
    return { ok: false, reason: `Offer is ${offer.status} — can't counter.`, status: 409 };
  }
  // Counter must sit between the offer and the original ask price —
  // otherwise the seller is just declining or accepting in disguise.
  if (input.counterPrice <= parseFloat(offer.offer_price)) {
    return {
      ok: false,
      reason: "Counter price must be higher than the offer (otherwise just accept).",
      status: 400,
    };
  }
  if (offer.ask_price && input.counterPrice >= parseFloat(offer.ask_price)) {
    return {
      ok: false,
      reason: "Counter price must be lower than the ask (otherwise just decline).",
      status: 400,
    };
  }

  await query(
    `UPDATE market_offers
        SET status='countered', responded_at=NOW(),
            counter_price=$2, counter_message=$3, updated_at=NOW()
      WHERE id=$1`,
    [input.offerId, input.counterPrice.toFixed(2), input.counterMessage?.trim() || null],
  );

  await notify({
    userId: offer.buyer_id,
    kind: "offer.countered",
    title: `Counter-offer: ${formatPrice(input.counterPrice)} for ${offer.card_name || offer.sku}`,
    body: input.counterMessage?.slice(0, 160)
      ?? `Your offer was ${formatPrice(parseFloat(offer.offer_price))}. Accept to lock the trade.`,
    linkUrl: "/account/offers",
    referenceType: "market_offer",
    referenceId: `${input.offerId}:countered`,
  });

  void logOfferTransition({
    offerId: input.offerId,
    action: "countered",
    actorId: input.sellerId,
    actorLabel: "seller",
    reason: input.counterMessage?.slice(0, 500) || null,
    metadata: { counter_price: input.counterPrice.toFixed(2), original_offer: offer.offer_price },
  });

  return { ok: true, value: (await loadOffer(input.offerId))! };
}

// ── Buyer actions: accept the seller's counter / withdraw ──

export async function acceptCounter(offerId: string, buyerId: string): Promise<Result<{
  offer: MarketOffer;
  trade: MarketTrade;
}>> {
  const offer = await loadOffer(offerId);
  if (!offer) return { ok: false, reason: "Offer not found.", status: 404 };
  if (offer.buyer_id !== buyerId) {
    return { ok: false, reason: "Not your offer to accept.", status: 403 };
  }
  if (offer.status !== "countered" || !offer.counter_price) {
    return { ok: false, reason: "No active counter to accept.", status: 409 };
  }

  const askRows = await query(
    `SELECT id, sku, condition, price, quantity, filled_quantity, user_id, card_name
       FROM market_orders WHERE id = $1 FOR UPDATE`,
    [offer.ask_order_id],
  );
  if (askRows.rows.length === 0) {
    return { ok: false, reason: "Ask is no longer available.", status: 409 };
  }
  const ask = askRows.rows[0];
  if (ask.quantity - ask.filled_quantity < offer.quantity) {
    return { ok: false, reason: "Ask no longer has enough remaining qty.", status: 409 };
  }

  const synthBid = await query(
    `INSERT INTO market_orders
       (user_id, side, sku, card_name, condition, price, quantity, status,
        filled_quantity, allow_offers)
     VALUES ($1, 'bid', $2, $3, $4, $5, $6, 'filled', $6, false)
     RETURNING id`,
    [offer.buyer_id, ask.sku, ask.card_name, ask.condition,
     offer.counter_price, offer.quantity],
  );

  const value = parseFloat(offer.counter_price) * offer.quantity;
  const commission = Math.round(value * 0.08 * 100) / 100;
  const sellerPayout = value - commission;

  const paymentExpiresAt = await paymentExpiresAtForBuyer(offer.buyer_id, DEFAULT_PAYMENT_WINDOW_HOURS);
  const tradeRow = await query(
    `INSERT INTO market_trades
       (bid_order_id, ask_order_id, buyer_id, seller_id, sku, price, quantity,
        commission_amount, seller_payout, escrow_status, payment_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'awaiting_payment',
             $10::timestamptz)
     RETURNING *`,
    [synthBid.rows[0].id, ask.id, offer.buyer_id, offer.seller_id,
     ask.sku, offer.counter_price, offer.quantity,
     commission.toFixed(2), sellerPayout.toFixed(2), paymentExpiresAt],
  );
  const trade = tradeRow.rows[0] as MarketTrade;

  await query(
    `UPDATE market_orders
        SET filled_quantity = filled_quantity + $2,
            status = (CASE WHEN filled_quantity + $2 >= quantity THEN 'filled'
                          ELSE 'partially_filled' END)::order_status,
            updated_at = NOW()
      WHERE id = $1`,
    [ask.id, offer.quantity],
  );

  await query(
    `UPDATE market_offers
        SET status='accepted', resolved_at=NOW(), trade_id=$2, updated_at=NOW()
      WHERE id=$1`,
    [offerId, trade.id],
  );

  await notify({
    userId: offer.seller_id,
    kind: "offer.counter_accepted",
    title: `Counter accepted: ${formatPrice(parseFloat(offer.counter_price))} for ${ask.card_name || ask.sku}`,
    body: "The buyer accepted your counter. Trade is now awaiting payment.",
    linkUrl: "/account/trades",
    referenceType: "market_offer",
    referenceId: `${offerId}:counter_accepted`,
  });

  void logOfferTransition({
    offerId,
    action: "accepted_counter",
    actorId: buyerId,
    actorLabel: "buyer",
    reason: `Buyer accepted counter at ${formatPrice(parseFloat(offer.counter_price))}`,
    metadata: { trade_id: trade.id, counter_price: offer.counter_price, original_offer: offer.offer_price },
  });
  void logTradeTransition({
    tradeId: trade.id,
    action: "created",
    actorId: buyerId,
    actorLabel: "buyer:counter-accept",
    reason: `Counter on offer ${offerId} accepted`,
    metadata: { offer_id: offerId, sku: trade.sku, price: trade.price, quantity: trade.quantity },
  });

  const updated = await loadOffer(offerId);
  return { ok: true, value: { offer: updated!, trade } };
}

export async function withdrawOffer(
  offerId: string, buyerId: string,
): Promise<Result<MarketOffer>> {
  const offer = await loadOffer(offerId);
  if (!offer) return { ok: false, reason: "Offer not found.", status: 404 };
  if (offer.buyer_id !== buyerId) {
    return { ok: false, reason: "Not your offer to withdraw.", status: 403 };
  }
  if (offer.status !== "pending" && offer.status !== "countered") {
    return { ok: false, reason: `Offer is ${offer.status} — can't withdraw.`, status: 409 };
  }

  await query(
    `UPDATE market_offers
        SET status='withdrawn', resolved_at=NOW(), updated_at=NOW()
      WHERE id=$1`,
    [offerId],
  );

  // Notify the seller — they had this in their inbox; tell them it's
  // gone so they don't waste a click reviewing it.
  await notify({
    userId: offer.seller_id,
    kind: "offer.withdrawn",
    title: `Offer withdrawn on ${offer.card_name || offer.sku}`,
    body: `${formatPrice(parseFloat(offer.offer_price))} offer was withdrawn before you responded.`,
    linkUrl: "/account/offers",
    referenceType: "market_offer",
    referenceId: `${offerId}:withdrawn`,
  });

  void logOfferTransition({
    offerId,
    action: "withdrawn",
    actorId: buyerId,
    actorLabel: "buyer",
    reason: "Buyer withdrew before seller responded",
  });

  return { ok: true, value: (await loadOffer(offerId))! };
}

// ── Sweep: expire offers past their TTL ──
// Called from /api/cron/maintenance alongside runMarketMaintenance.
// Idempotent — partial idx scoped to (status IN pending|countered).
export async function expireOffers(): Promise<{ expired: number }> {
  const r = await query(
    `UPDATE market_offers
        SET status='expired', resolved_at=NOW(), updated_at=NOW()
      WHERE status IN ('pending', 'countered')
        AND expires_at < NOW()
      RETURNING id, buyer_id, seller_id, offer_price, ask_order_id`,
  );
  for (const row of r.rows) {
    const askInfo = await query(
      `SELECT card_name, sku FROM market_orders WHERE id = $1`,
      [row.ask_order_id],
    );
    const label = askInfo.rows[0]?.card_name || askInfo.rows[0]?.sku || "ask";
    // Note: "within the seller's response window" — not "48h" — since
    // the seller may have declared a custom window via the Asynchronous's
    // column (migration 0092). The expires_at on the offer row is the
    // substrate-honest source for the actual window.
    await notify({
      userId: row.buyer_id,
      kind: "offer.expired",
      title: `Offer expired on ${label}`,
      body: `Your ${formatPrice(parseFloat(row.offer_price))} offer wasn't responded to in time.`,
      linkUrl: "/account/offers",
      referenceType: "market_offer",
      referenceId: `${row.id}:expired`,
    });
    void logOfferTransition({
      offerId: row.id,
      action: "expired",
      actorLabel: "system:offer-sweep",
      reason: "TTL elapsed without seller response",
    });
  }
  return { expired: r.rows.length };
}

// Lowball-abuse detector. Pattern: ≥10 offers ≤30% of ask price in
// the last 7d from the same buyer. Mirrors the trade-cancel-abuse
// shape: dedup by buyer + day so one detector firing per day max.
async function detectOfferLowballAbuse(buyerId: string): Promise<void> {
  const r = await query(
    `SELECT COUNT(*)::int AS cnt
       FROM market_offer_lifecycle_log log
       JOIN market_offers o ON o.id = log.offer_id
      WHERE log.action = 'created'
        AND o.buyer_id = $1
        -- audit:cadence-platform — fraud heuristic window, not a user-response deadline.
        AND log.created_at >= NOW() - INTERVAL '7 days'
        AND COALESCE((log.metadata->>'offer_pct_of_ask')::int, 100) <= 30`,
    [buyerId],
  );
  const cnt = r.rows[0]?.cnt ?? 0;
  if (cnt < 10) return;

  const today = new Date().toISOString().slice(0, 10);
  const { emitSignal, SIGNAL_DEFS } = await import("@/lib/fraud/detection");
  await emitSignal({
    userId: buyerId,
    def: SIGNAL_DEFS.OFFER_LOWBALL_ABUSE,
    description: `${cnt} offers ≤30% of ask in the last 7 days`,
    dedupeKey: `offer-lowball:${buyerId}:${today}`,
  });
}

// ── List queries for /account/offers ──

export async function listOffersForBuyer(
  buyerId: string,
  options: { activeOnly?: boolean } = {},
): Promise<MarketOffer[]> {
  const where = options.activeOnly
    ? `AND o.status IN ('pending', 'countered')`
    : "";
  const r = await query(
    `SELECT o.*, mo.sku, mo.card_name, mo.price AS ask_price,
            su.username AS seller_username, su.name AS seller_name
       FROM market_offers o
       JOIN market_orders mo ON mo.id = o.ask_order_id
       LEFT JOIN users su ON su.id = o.seller_id
      WHERE o.buyer_id = $1 ${where}
      ORDER BY o.created_at DESC LIMIT 100`,
    [buyerId],
  );
  return r.rows as MarketOffer[];
}

export async function listOffersForSeller(
  sellerId: string,
  options: { activeOnly?: boolean } = {},
): Promise<MarketOffer[]> {
  const where = options.activeOnly
    ? `AND o.status IN ('pending', 'countered')`
    : "";
  const r = await query(
    `SELECT o.*, mo.sku, mo.card_name, mo.price AS ask_price,
            bu.username AS buyer_username, bu.name AS buyer_name
       FROM market_offers o
       JOIN market_orders mo ON mo.id = o.ask_order_id
       LEFT JOIN users bu ON bu.id = o.buyer_id
      WHERE o.seller_id = $1 ${where}
      ORDER BY o.created_at DESC LIMIT 100`,
    [sellerId],
  );
  return r.rows as MarketOffer[];
}

export async function getOffer(offerId: string): Promise<MarketOffer | null> {
  return loadOffer(offerId);
}
