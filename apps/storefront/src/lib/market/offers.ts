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

import { query, transaction } from "@/lib/db";
import { computeCommissionAmount, resolveCommission } from "@cambridge-tcg/pricing";
import { notify } from "@/lib/notifications/db";
import { canTrade, getTrustTier } from "@/lib/escrow/trust-engine";
import { routeTrade } from "@/lib/escrow/service-tiers";
import { formatPrice } from "@/lib/format";
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
  // Counterparty reputation (global free trade, 2026-06-10): tier +
  // review count replace identity verification at the point of trade.
  // Tier name is derived in TS from trust_score (no tier column in DB);
  // only the counterparty side of each list query is populated.
  buyer_trust_score?: number | null;
  buyer_tier?: string | null;
  buyer_review_count?: number | null;
  seller_trust_score?: number | null;
  seller_tier?: string | null;
  seller_review_count?: number | null;
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
// historical 24h default applies for everyone who hasn't. The column is
// read inside the acceptance transaction (same client as the trade
// INSERT) rather than via @/lib/users/response-window, which queries on
// the global connection.
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

// ── Acceptance economics (pure) ──
// The rate is the min(membership, trust) combine from packages/pricing —
// the same resolver placeOrder's match loop uses — and the per-item cap
// bounds the absolute fee. Exported for unit tests; no DB access.
export function acceptedOfferEconomics(input: {
  agreedPrice: number;
  quantity: number;
  sellerTrustScore: number;
  /** Membership tier's configured P2P rate; null when no tier. */
  sellerTierRate: number | null;
}): {
  value: number;
  rate: number;
  source: "membership" | "trust" | "default";
  commission: number;
  sellerPayout: number;
} {
  const value = Math.round(input.agreedPrice * input.quantity * 100) / 100;
  const { rate, source } = resolveCommission({
    trustScore: input.sellerTrustScore,
    tierRate: input.sellerTierRate,
    kind: "p2p",
  });
  const commission = computeCommissionAmount(value, rate).amount;
  const sellerPayout = Math.round((value - commission) * 100) / 100;
  return { value, rate, source, commission, sellerPayout };
}

// ── Shared acceptance engine ──
//
// Both accept paths (seller accepts the buyer's offer, buyer accepts the
// seller's counter) funnel through here. Everything acceptance must write
// happens in ONE transaction with rows locked, so escrow routing, the
// resolved commission, the returns snapshot, and the oversell guard live
// in exactly one place — mirroring what placeOrder's match loop
// (lib/market/db.ts) writes for organic matches. The trade rows the two
// paths produce are indistinguishable downstream: the payout sweep,
// dispute windows, and returns all read the trade's own columns
// (payout_hold_days, dispute_window_hours, accepts_returns, ...), which
// therefore must never be left NULL here.
//
// Locking order is offer → ask. Concurrent accepts of the same offer
// serialize on the offer lock; concurrent accepts of different offers
// against the same ask serialize on the ask lock, so the remaining-qty
// check cannot oversell. (A plain query() FOR UPDATE runs autocommit and
// releases the lock immediately — the lock is only real inside
// transaction().)
async function createTradeForAcceptedOffer(input: {
  offerId: string;
  requiredStatus: "pending" | "countered";
  priceField: "offer_price" | "counter_price";
}): Promise<Result<{
  trade: MarketTrade;
  cardLabel: string;
  agreedPrice: number;
  paymentWindowHours: number;
}>> {
  return transaction(async (q) => {
    const offerRows = await q(
      `SELECT * FROM market_offers WHERE id = $1 FOR UPDATE`,
      [input.offerId],
    );
    if (offerRows.rows.length === 0) {
      return { ok: false as const, reason: "Offer not found.", status: 404 };
    }
    const offer = offerRows.rows[0] as MarketOffer;
    if (offer.status !== input.requiredStatus) {
      return input.requiredStatus === "countered"
        ? { ok: false as const, reason: "No active counter to accept.", status: 409 }
        : { ok: false as const, reason: `Offer is ${offer.status} — can't accept.`, status: 409 };
    }
    const agreedPriceStr =
      input.priceField === "counter_price" ? offer.counter_price : offer.offer_price;
    if (!agreedPriceStr) {
      return { ok: false as const, reason: "No active counter to accept.", status: 409 };
    }

    const askRows = await q(
      `SELECT id, user_id, sku, card_name, condition, price, quantity,
              filled_quantity, status, accepts_returns, return_window_days
         FROM market_orders WHERE id = $1 FOR UPDATE`,
      [offer.ask_order_id],
    );
    const ask = askRows.rows[0];
    if (!ask || (ask.status !== "open" && ask.status !== "partially_filled")) {
      return { ok: false as const, reason: "Ask is no longer available.", status: 409 };
    }
    if (ask.quantity - ask.filled_quantity < offer.quantity) {
      return { ok: false as const, reason: "Not enough remaining qty on the ask.", status: 409 };
    }

    // Both parties' standing in one round trip: trust for escrow routing,
    // tier rate for the commission combine, flags for the full-escrow
    // override, and the buyer's declared cadence (migration 0092) for the
    // payment deadline.
    const partiesRes = await q(
      `SELECT u.id, u.trust_score, u.response_window_hours,
              COALESCE(tp.is_flagged, false) AS is_flagged,
              t.p2p_commission_rate          AS tier_rate
         FROM users u
         LEFT JOIN trust_profiles tp ON tp.user_id = u.id
         LEFT JOIN tiers          t  ON t.id       = u.tier_id
        WHERE u.id IN ($1, $2)`,
      [offer.buyer_id, offer.seller_id],
    );
    const partyById = new Map<string, (typeof partiesRes.rows)[number]>(
      partiesRes.rows.map((r) => [r.id as string, r]),
    );
    const buyer = partyById.get(offer.buyer_id);
    const seller = partyById.get(offer.seller_id);
    const buyerTrust = Number(buyer?.trust_score ?? 0);
    const sellerTrust = Number(seller?.trust_score ?? 0);

    const agreedPrice = parseFloat(agreedPriceStr);
    const economics = acceptedOfferEconomics({
      agreedPrice,
      quantity: offer.quantity,
      sellerTrustScore: sellerTrust,
      sellerTierRate: seller?.tier_rate != null ? parseFloat(seller.tier_rate) : null,
    });

    const routing = await routeTrade({
      tradeValue: economics.value,
      sellerTrustScore: sellerTrust,
      buyerTrustScore: buyerTrust,
      sellerIsFlagged: !!seller?.is_flagged,
      buyerIsFlagged: !!buyer?.is_flagged,
      cardName: ask.card_name || undefined,
      condition: ask.condition,
    });

    const paymentWindowHours =
      (buyer?.response_window_hours as number | null | undefined) ?? DEFAULT_PAYMENT_WINDOW_HOURS;
    const paymentExpiresAt = new Date(
      Date.now() + paymentWindowHours * 60 * 60 * 1000,
    ).toISOString();

    // Synthesize a 'bid' order so market_trades's bid_order_id FK is
    // satisfied. Marked filled immediately — it's a paper trail for
    // the offer-driven match, not an order on the book.
    const synthBid = await q(
      `INSERT INTO market_orders
         (user_id, side, sku, card_name, condition, price, quantity, status,
          filled_quantity, allow_offers)
       VALUES ($1, 'bid', $2, $3, $4, $5, $6, 'filled', $6, false)
       RETURNING id`,
      [offer.buyer_id, ask.sku, ask.card_name, ask.condition,
       agreedPriceStr, offer.quantity],
    );

    // accepts_returns + return_window_days snapshot from the ask so later
    // listing edits can't retroactively change a trade's return
    // eligibility (returns.ts reads the trade row, not the listing).
    const tradeRow = await q(
      `INSERT INTO market_trades
         (bid_order_id, ask_order_id, buyer_id, seller_id, sku, price, quantity,
          commission_rate, commission_amount, seller_payout,
          escrow_tier, requires_photos, requires_inspection, seller_ships_to,
          dispute_window_hours, payout_hold_days, payment_expires_at,
          accepts_returns, return_window_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
               $17::timestamptz,$18,$19)
       RETURNING *`,
      [synthBid.rows[0].id, ask.id, offer.buyer_id, offer.seller_id,
       ask.sku, agreedPriceStr, offer.quantity,
       economics.rate.toFixed(4), economics.commission.toFixed(2),
       economics.sellerPayout.toFixed(2),
       routing.tier, routing.requiresPhotos, routing.requiresInspection,
       routing.sellerShipsTo, routing.disputeWindowHours, routing.payoutHoldDays,
       paymentExpiresAt, ask.accepts_returns, ask.return_window_days],
    );
    const trade = tradeRow.rows[0] as MarketTrade;

    // Update ask filled_quantity. Cast to order_status — the literal
    // 'filled'/'partially_filled' would otherwise be inferred as text
    // and PG rejects the assignment.
    await q(
      `UPDATE market_orders
          SET filled_quantity = filled_quantity + $2,
              status = (CASE WHEN filled_quantity + $2 >= quantity THEN 'filled'
                            ELSE 'partially_filled' END)::order_status,
              updated_at = NOW()
        WHERE id = $1`,
      [ask.id, offer.quantity],
    );

    await q(
      `UPDATE market_offers
          SET status='accepted', responded_at=COALESCE(responded_at, NOW()),
              resolved_at=NOW(), trade_id=$2, updated_at=NOW()
        WHERE id=$1`,
      [input.offerId, trade.id],
    );

    return {
      ok: true as const,
      value: {
        trade,
        cardLabel: (ask.card_name as string | null) || (ask.sku as string),
        agreedPrice,
        paymentWindowHours,
      },
    };
  });
}

// ── Seller actions: accept / decline / counter ──

export async function acceptOffer(offerId: string, sellerId: string): Promise<Result<{
  offer: MarketOffer;
  trade: MarketTrade;
}>> {
  // Fast-fail permission + state checks. seller_id is immutable so the
  // ownership check holds; the status check is repeated under the lock
  // inside the acceptance engine.
  const offer = await loadOffer(offerId);
  if (!offer) return { ok: false, reason: "Offer not found.", status: 404 };
  if (offer.seller_id !== sellerId) {
    return { ok: false, reason: "Not your offer to accept.", status: 403 };
  }
  if (offer.status !== "pending") {
    return { ok: false, reason: `Offer is ${offer.status} — can't accept.`, status: 409 };
  }

  const result = await createTradeForAcceptedOffer({
    offerId,
    requiredStatus: "pending",
    priceField: "offer_price",
  });
  if (!result.ok) return result;
  const { trade, cardLabel, agreedPrice, paymentWindowHours } = result.value;

  // Notify the buyer to pay. The window in the copy is the same one the
  // trade row enforces (payment_expires_at) — never a fixed hour count.
  await notify({
    userId: offer.buyer_id,
    kind: "offer.accepted",
    title: `Offer accepted: ${formatPrice(agreedPrice)} for ${cardLabel}`,
    body: `Pay within ${paymentWindowHours}h to lock in the trade.`,
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
  // Fast-fail permission + state checks; the state check is repeated
  // under the lock inside the acceptance engine.
  const offer = await loadOffer(offerId);
  if (!offer) return { ok: false, reason: "Offer not found.", status: 404 };
  if (offer.buyer_id !== buyerId) {
    return { ok: false, reason: "Not your offer to accept.", status: 403 };
  }
  if (offer.status !== "countered" || !offer.counter_price) {
    return { ok: false, reason: "No active counter to accept.", status: 409 };
  }

  const result = await createTradeForAcceptedOffer({
    offerId,
    requiredStatus: "countered",
    priceField: "counter_price",
  });
  if (!result.ok) return result;
  const { trade, cardLabel, agreedPrice } = result.value;

  await notify({
    userId: offer.seller_id,
    kind: "offer.counter_accepted",
    title: `Counter accepted: ${formatPrice(agreedPrice)} for ${cardLabel}`,
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
            su.username AS seller_username, su.name AS seller_name,
            stp.trust_score AS seller_trust_score,
            stp.total_reviews AS seller_review_count
       FROM market_offers o
       JOIN market_orders mo ON mo.id = o.ask_order_id
       LEFT JOIN users su ON su.id = o.seller_id
       LEFT JOIN trust_profiles stp ON stp.user_id = o.seller_id
      WHERE o.buyer_id = $1 ${where}
      ORDER BY o.created_at DESC LIMIT 100`,
    [buyerId],
  );
  // Tier name derived in TS — same derivation auction/state.ts uses.
  return r.rows.map((row) => ({
    ...row,
    seller_tier: row.seller_trust_score != null
      ? getTrustTier(Number(row.seller_trust_score)).name
      : null,
  })) as MarketOffer[];
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
            bu.username AS buyer_username, bu.name AS buyer_name,
            btp.trust_score AS buyer_trust_score,
            btp.total_reviews AS buyer_review_count
       FROM market_offers o
       JOIN market_orders mo ON mo.id = o.ask_order_id
       LEFT JOIN users bu ON bu.id = o.buyer_id
       LEFT JOIN trust_profiles btp ON btp.user_id = o.buyer_id
      WHERE o.seller_id = $1 ${where}
      ORDER BY o.created_at DESC LIMIT 100`,
    [sellerId],
  );
  // Tier name derived in TS — same derivation auction/state.ts uses.
  return r.rows.map((row) => ({
    ...row,
    buyer_tier: row.buyer_trust_score != null
      ? getTrustTier(Number(row.buyer_trust_score)).name
      : null,
  })) as MarketOffer[];
}

export async function getOffer(offerId: string): Promise<MarketOffer | null> {
  return loadOffer(offerId);
}
