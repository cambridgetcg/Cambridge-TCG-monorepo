// Customer journey timeline — the META-pattern module.
//
// Composes every lifecycle log + the platform's two voices (in-app
// bell, outbound email) into a single chronological feed per user.
// No new schema, no migration; the value is *retroactive* — every
// prior audit-log investment now has a unified surface.
//
// ── The three voices ─────────────────────────────────────────────────────
//
// Every consequential event on the platform speaks three times to
// reach the user:
//
//   1. The **substrate** speaks. A row lands in chargeback_lifecycle_log,
//      market_trade_lifecycle_log, vault_fulfilment_log, etc. This is
//      what *happened* to the user's stuff. It is the domain's source
//      of record. The status column is a cache; the log is the truth.
//
//   2. The **bell** rings. A row lands in `notifications` (the in-app
//      inbox). This is the platform tapping the user on the shoulder
//      with a header in their bell dropdown. Some events ring the bell;
//      some don't (system-internal, user-already-knows, deduplicated).
//
//   3. The **inbox** receives. A row lands in `email_queue` and, if
//      the user's preferences allow it, gets sent. This is the
//      platform reaching outside its own pages into the user's email.
//      Some events email; some don't (preference off, essential bypass).
//
// All three streams used to live separately. A user looking at their
// /account/standing journey saw the substrate-change rows but not the
// bell-ring rows or the email-sent rows — a transparency gap noted in
// docs/connections/email.md. Wiring all three together turns the
// timeline into a true *chorus*: the user sees what happened AND
// what they were told AND through which channel.
//
// ── Sources covered (parallel SELECT, normalize in-app) ─────────────────
//
//   Substrate (16):
//     - vault_fulfilment_log       (vault item transitions)
//     - prize_fulfilment_log       (raffle/box/pack ship transitions)
//     - review_lifecycle_log       (submitted, hidden, appealed)
//     - external_rep_lifecycle_log (verified, decay-failed)
//     - chargeback_lifecycle_log   (received, status_changed, won/lost)
//     - refund_lifecycle_log       (received, abuse_checked)
//     - failed_payment_lifecycle_log (received, retried)
//     - admin_actions_log          (suspend, override; admin-path filters)
//     - bounty_pulls               (per resolved pull)
//     - verifiable_draws           (per draw)
//     - trade_lifecycle_log        (every market_trades transition)
//     - auction_lifecycle_log      (every auction transition)
//     - market_offer_lifecycle_log (every offer transition)
//     - market_return_lifecycle_log (every return transition)
//     - market_lot_lifecycle_log   (every lot transition)
//     - automation logs (UNION ALL of pricing_rule + saved_search +
//       watch_alert lifecycle logs)
//
//   Voices (2 — the bridge wired in this commit):
//     - notifications              (the in-app bell rings)
//     - email_queue (status='sent') (the inbox receives)
//
// Adding a new source = add one entry to SOURCES below. The query
// shape is uniform: per-user, ORDER BY ts DESC, LIMIT N.
//
// See docs/connections/three-voices.md for the fairy-tale form — why
// the chorus exists, why the bell and the inbox were missing, and what
// the merge teaches about the platform's relationship with its user.

import { query } from "@/lib/db";

export interface JourneyEvent {
  /** Source-prefixed kind: 'vault.shipped', 'review.submitted',
   *  'chargeback.received', 'admin.user.suspend', etc. */
  kind: string;
  /** Human-readable summary suitable for display. */
  summary: string;
  /** When it happened. */
  at: Date;
  /** Optional deep-link into the source surface. */
  link: string | null;
  /** Group label for filter chips. */
  group: "vault" | "prize" | "review" | "external_rep" | "payment"
       | "trade" | "draw" | "admin" | "trust" | "auction" | "offer" | "return" | "lot"
       | "automation"
       | "notice"   // in-app bell rings (notifications table)
       | "message"; // outbound email (email_queue, status='sent')
  /** Severity-style tone for the UI (matches our existing palettes). */
  tone: "default" | "amber" | "emerald" | "red" | "sky" | "fuchsia";
  /** Internal — used by privacy filter to scrub admin-only events. */
  isAdminOnly?: boolean;
}

export interface JourneyOptions {
  /** Max events per source. Total returned will be ≤ sources × perSource. */
  perSource?: number;
  /** Filter to a single group (optional). */
  group?: JourneyEvent["group"];
  /** Drop admin-only events (customer-facing path always passes true). */
  hideAdminOnly?: boolean;
  /** Cut events older than this (optional). */
  since?: Date;
}

const DEFAULT_PER_SOURCE = 50;

/**
 * Run all source queries in parallel, normalize, merge-sort, paginate.
 */
export async function getUserJourney(userId: string, opts: JourneyOptions = {}): Promise<JourneyEvent[]> {
  const perSource = opts.perSource ?? DEFAULT_PER_SOURCE;
  const sinceISO = opts.since ? opts.since.toISOString() : null;

  const sources = await Promise.allSettled([
    fetchVault(userId, perSource, sinceISO),
    fetchPrize(userId, perSource, sinceISO),
    fetchReviews(userId, perSource, sinceISO),
    fetchExternalRep(userId, perSource, sinceISO),
    fetchChargebacks(userId, perSource, sinceISO),
    fetchRefunds(userId, perSource, sinceISO),
    fetchFailedPayments(userId, perSource, sinceISO),
    fetchAdminActions(userId, perSource, sinceISO),
    fetchBountyPulls(userId, perSource, sinceISO),
    fetchVerifiableDraws(userId, perSource, sinceISO),
    fetchTradeTransitions(userId, perSource, sinceISO),
    fetchAuctionTransitions(userId, perSource, sinceISO),
    fetchOfferTransitions(userId, perSource, sinceISO),
    fetchReturnTransitions(userId, perSource, sinceISO),
    fetchLotTransitions(userId, perSource, sinceISO),
    fetchAutomationTransitions(userId, perSource, sinceISO),
    // ── The platform's two voices — see header § "The three voices" ─────
    fetchNotifications(userId, perSource, sinceISO),
    fetchEmailsSent(userId, perSource, sinceISO),
  ]);

  let merged: JourneyEvent[] = [];
  for (const r of sources) {
    if (r.status === "fulfilled") merged.push(...r.value);
    else console.error("[journey] source failed:", r.reason);
  }

  if (opts.group) merged = merged.filter((e) => e.group === opts.group);
  if (opts.hideAdminOnly) merged = merged.filter((e) => !e.isAdminOnly);

  // Merge-sort newest first.
  merged.sort((a, b) => b.at.getTime() - a.at.getTime());

  return merged;
}

// ── Per-source fetchers + renderers ────────────────────────────────

async function fetchVault(userId: string, limit: number, since: string | null): Promise<JourneyEvent[]> {
  const sinceClause = since ? "AND log.created_at >= $3" : "";
  const params: unknown[] = [userId, limit];
  if (since) params.push(since);
  const r = await query(
    `SELECT log.action, log.notes, log.created_at, v.id AS vault_id, v.card_name
       FROM vault_fulfilment_log log
       JOIN vault_items v ON v.id = log.vault_item_id
      WHERE v.user_id = $1 ${sinceClause}
      ORDER BY log.created_at DESC LIMIT $2`,
    params,
  );
  return r.rows.map((row): JourneyEvent => ({
    kind: `vault.${row.action}`,
    summary: vaultSummary(row.action, row.card_name, row.notes),
    at: new Date(row.created_at),
    link: `/account/vault`,
    group: "vault",
    tone: row.action === "fulfilled" ? "emerald" : row.action === "undone" ? "amber" : "default",
  }));
}

function vaultSummary(action: string, cardName: string, notes: string | null): string {
  switch (action) {
    case "fulfilled": return `Shipped: ${cardName}`;
    case "undone":    return `Ship undone: ${cardName}`;
    default:          return `Vault item — ${action.replace(/_/g, " ")}: ${cardName}${notes ? ` (${notes})` : ""}`;
  }
}

async function fetchPrize(userId: string, limit: number, since: string | null): Promise<JourneyEvent[]> {
  const sinceClause = since ? "AND created_at >= $3" : "";
  const params: unknown[] = [userId, limit];
  if (since) params.push(since);
  const r = await query(
    `SELECT prize_kind, prize_id, action, notes, created_at
       FROM prize_fulfilment_log
      WHERE user_id = $1 ${sinceClause}
      ORDER BY created_at DESC LIMIT $2`,
    params,
  );
  return r.rows.map((row): JourneyEvent => ({
    kind: `prize.${row.action}`,
    summary: `Prize (${row.prize_kind.replace("_", " ")}) ${row.action.replace(/_/g, " ")}`,
    at: new Date(row.created_at),
    link: `/account/rewards`,
    group: "prize",
    tone: row.action === "shipped" ? "emerald" : row.action === "undone" ? "amber" : "default",
  }));
}

async function fetchReviews(userId: string, limit: number, since: string | null): Promise<JourneyEvent[]> {
  const sinceClause = since ? "AND log.created_at >= $3" : "";
  const params: unknown[] = [userId, limit];
  if (since) params.push(since);
  const r = await query(
    `SELECT log.action, log.created_at, log.actor_label, r.rating, r.role,
            r.reviewer_id = $1 AS reviewer_is_user
       FROM review_lifecycle_log log
       JOIN trade_reviews r ON r.id = log.review_id
      WHERE (r.reviewer_id = $1 OR r.reviewee_id = $1) ${sinceClause}
      ORDER BY log.created_at DESC LIMIT $2`,
    params,
  );
  return r.rows.map((row): JourneyEvent => ({
    kind: `review.${row.action}`,
    summary: reviewSummary(row.action, row.rating, row.role, row.reviewer_is_user),
    at: new Date(row.created_at),
    link: `/account/reviews`,
    group: "review",
    tone: row.action === "submitted" && row.rating >= 4 ? "emerald"
      : row.action === "hidden" ? "amber" : "default",
    isAdminOnly: row.actor_label?.startsWith("system:") && row.action === "flagged",
  }));
}

function reviewSummary(action: string, rating: number, role: string, isReviewer: boolean): string {
  const subject = isReviewer ? "you left" : "you received";
  switch (action) {
    case "submitted":  return `${rating}-star review ${subject} (as ${role})`;
    case "hidden":     return `Review hidden by moderation`;
    case "unhidden":   return `Review restored`;
    case "appealed":   return `You appealed a hidden review`;
    case "appeal_dismissed": return `Appeal dismissed`;
    default:           return `Review ${action.replace(/_/g, " ")}`;
  }
}

async function fetchExternalRep(userId: string, limit: number, since: string | null): Promise<JourneyEvent[]> {
  const sinceClause = since ? "AND log.created_at >= $3" : "";
  const params: unknown[] = [userId, limit];
  if (since) params.push(since);
  const r = await query(
    `SELECT log.action, log.created_at, log.reason, er.platform
       FROM external_rep_lifecycle_log log
       JOIN external_reputation er ON er.id = log.rep_id
      WHERE er.user_id = $1 ${sinceClause}
      ORDER BY log.created_at DESC LIMIT $2`,
    params,
  );
  return r.rows.map((row): JourneyEvent => ({
    kind: `external_rep.${row.action}`,
    summary: extRepSummary(row.action, row.platform),
    at: new Date(row.created_at),
    link: `/account/external-rep`,
    group: "external_rep",
    tone: row.action === "verify_succeeded" ? "emerald"
      : row.action.includes("fail") || row.action.includes("decay") ? "amber" : "default",
  }));
}

function extRepSummary(action: string, platform: string): string {
  switch (action) {
    case "verify_succeeded": return `${platform} reputation verified`;
    case "verify_failed":    return `${platform} verification failed`;
    case "code_issued":      return `${platform} verification code issued`;
    case "decay_triggered":  return `${platform} re-verification due`;
    case "decay_failed":     return `${platform} re-verification failed`;
    case "removed":          return `${platform} connection removed`;
    default:                 return `${platform} — ${action.replace(/_/g, " ")}`;
  }
}

async function fetchChargebacks(userId: string, limit: number, since: string | null): Promise<JourneyEvent[]> {
  const sinceClause = since ? "AND log.created_at >= $3" : "";
  const params: unknown[] = [userId, limit];
  if (since) params.push(since);
  const r = await query(
    `SELECT log.action, log.created_at, log.reason, c.amount_gbp, c.stripe_status
       FROM chargeback_lifecycle_log log
       JOIN chargebacks c ON c.stripe_dispute_id = log.stripe_dispute_id
      WHERE c.user_id = $1 ${sinceClause}
      ORDER BY log.created_at DESC LIMIT $2`,
    params,
  );
  return r.rows.map((row): JourneyEvent => ({
    kind: `chargeback.${row.action}`,
    summary: `Chargeback £${parseFloat(row.amount_gbp).toFixed(2)} — ${row.action.replace(/_/g, " ")}`,
    at: new Date(row.created_at),
    link: `/account/chargebacks`,
    group: "payment",
    tone: row.action === "received" ? "red" : row.action === "won" ? "emerald" : "amber",
  }));
}

async function fetchRefunds(userId: string, limit: number, since: string | null): Promise<JourneyEvent[]> {
  const sinceClause = since ? "AND log.created_at >= $3" : "";
  const params: unknown[] = [userId, limit];
  if (since) params.push(since);
  const r = await query(
    `SELECT log.action, log.created_at, r.amount_gbp, r.stripe_status, r.stripe_reason
       FROM refund_lifecycle_log log
       JOIN refunds r ON r.stripe_refund_id = log.stripe_refund_id
      WHERE r.user_id = $1 ${sinceClause}
      ORDER BY log.created_at DESC LIMIT $2`,
    params,
  );
  return r.rows.map((row): JourneyEvent => ({
    kind: `refund.${row.action}`,
    summary: `Refund £${parseFloat(row.amount_gbp).toFixed(2)} — ${row.stripe_status}${row.stripe_reason ? ` (${row.stripe_reason})` : ""}`,
    at: new Date(row.created_at),
    link: `/account/refunds`,
    group: "payment",
    tone: row.stripe_status === "succeeded" ? "sky" : "default",
    isAdminOnly: row.action === "abuse_checked",
  }));
}

async function fetchFailedPayments(userId: string, limit: number, since: string | null): Promise<JourneyEvent[]> {
  const sinceClause = since ? "AND log.created_at >= $3" : "";
  const params: unknown[] = [userId, limit];
  if (since) params.push(since);
  const r = await query(
    `SELECT log.action, log.created_at, fp.amount_gbp, fp.failure_code, fp.attempt_count
       FROM failed_payment_lifecycle_log log
       JOIN failed_payments fp ON fp.stripe_payment_intent = log.stripe_payment_intent
      WHERE fp.user_id = $1 ${sinceClause}
      ORDER BY log.created_at DESC LIMIT $2`,
    params,
  );
  return r.rows.map((row): JourneyEvent => ({
    kind: `failed_payment.${row.action}`,
    summary: `Payment £${parseFloat(row.amount_gbp).toFixed(2)} ${row.action} (${row.failure_code ?? "unknown"})`,
    at: new Date(row.created_at),
    link: `/account/payment-issues`,
    group: "payment",
    tone: "amber",
    isAdminOnly: row.action === "burst_checked",
  }));
}

async function fetchAdminActions(userId: string, limit: number, since: string | null): Promise<JourneyEvent[]> {
  // Customer-facing only: actions where the user themselves is the
  // target AND the action affects their account state visibly.
  // Privacy: we mark these isAdminOnly=false but the privacy filter
  // could still scrub specific subsets if needed.
  const sinceClause = since ? "AND created_at >= $3" : "";
  const params: unknown[] = [userId, limit];
  if (since) params.push(since);
  const r = await query(
    `SELECT action, created_at, reason
       FROM admin_actions_log
      WHERE target_user_id = $1
        AND action IN ('user.suspend', 'user.unsuspend', 'user.auto_suspend',
                       'user.trust_override', 'user.chargeback_received')
        ${sinceClause}
      ORDER BY created_at DESC LIMIT $2`,
    params,
  );
  return r.rows.map((row): JourneyEvent => ({
    kind: `admin.${row.action}`,
    summary: adminSummary(row.action, row.reason),
    at: new Date(row.created_at),
    link: `/account/standing`,
    group: "admin",
    tone: row.action.includes("suspend") && !row.action.includes("unsuspend") ? "red"
      : row.action === "user.unsuspend" ? "emerald" : "amber",
  }));
}

function adminSummary(action: string, reason: string | null): string {
  switch (action) {
    case "user.suspend":       return `Account suspended${reason ? `: ${reason}` : ""}`;
    case "user.auto_suspend":  return `Account auto-suspended${reason ? ` — ${reason}` : ""}`;
    case "user.unsuspend":     return `Account suspension lifted`;
    case "user.trust_override": return `Trust score adjusted by support`;
    case "user.chargeback_received": return `Chargeback received against your account`;
    default:                   return action.replace(/_/g, " ");
  }
}

async function fetchBountyPulls(userId: string, limit: number, since: string | null): Promise<JourneyEvent[]> {
  const sinceClause = since ? "AND resolved_at >= $3" : "";
  const params: unknown[] = [userId, limit];
  if (since) params.push(since);
  const r = await query(
    `SELECT id, tier, rolled_rarity, resolved_at
       FROM bounty_pulls
      WHERE user_id = $1 AND rolled_rarity IS NOT NULL ${sinceClause}
      ORDER BY resolved_at DESC LIMIT $2`,
    params,
  );
  return r.rows.map((row): JourneyEvent => ({
    kind: `bounty.pull_resolved`,
    summary: `Pulled ${row.rolled_rarity} from a ${row.tier} pull`,
    at: new Date(row.resolved_at),
    link: `/verify/pull/${row.id}`,
    group: "draw",
    tone: ["super_rare", "legendary"].includes(row.rolled_rarity) ? "fuchsia"
      : row.rolled_rarity === "rare" ? "amber" : "default",
  }));
}

async function fetchVerifiableDraws(userId: string, limit: number, since: string | null): Promise<JourneyEvent[]> {
  const sinceClause = since ? "AND revealed_at >= $3" : "";
  const params: unknown[] = [userId, limit];
  if (since) params.push(since);
  const r = await query(
    `SELECT id, kind, outcome, revealed_at
       FROM verifiable_draws
      WHERE user_id = $1 AND revealed_at IS NOT NULL ${sinceClause}
      ORDER BY revealed_at DESC LIMIT $2`,
    params,
  );
  return r.rows.map((row): JourneyEvent => {
    const outcome = row.outcome as { picked?: string; slots?: Array<{ picked: string }> } | null;
    const picked = outcome?.slots
      ? `${outcome.slots.length} slot${outcome.slots.length === 1 ? "" : "s"}`
      : outcome?.picked ?? "—";
    return {
      kind: `draw.${row.kind}`,
      summary: `${row.kind.replace(/_/g, " ")}: ${picked}`,
      at: new Date(row.revealed_at),
      link: `/verify/draw/${row.id}`,
      group: "draw",
      tone: "default",
    };
  });
}

async function fetchTradeTransitions(userId: string, limit: number, since: string | null): Promise<JourneyEvent[]> {
  // Reads from trade_lifecycle_log (replaces the old terminal-only
  // snapshot synth). Surfaces every transition the user was party to,
  // matching the auction module's depth.
  const sinceClause = since ? "AND log.created_at >= $3" : "";
  const params: unknown[] = [userId, limit];
  if (since) params.push(since);
  const r = await query(
    `SELECT log.action, log.created_at, log.reason, log.metadata,
            t.id AS trade_id, t.price, t.sku, t.buyer_id, t.seller_id,
            t.buyer_id = $1 AS user_is_buyer
       FROM trade_lifecycle_log log
       JOIN market_trades t ON t.id = log.trade_id
      WHERE (t.buyer_id = $1 OR t.seller_id = $1) ${sinceClause}
      ORDER BY log.created_at DESC LIMIT $2`,
    params,
  );
  return r.rows.map((row): JourneyEvent => ({
    kind: `trade.${row.action}`,
    summary: tradeSummary(row.action, row.sku, parseFloat(row.price), row.user_is_buyer),
    at: new Date(row.created_at),
    link: `/account/trades/${row.trade_id}`,
    group: "trade",
    tone: row.action === "completed" ? "emerald"
      : row.action === "paid" ? "emerald"
      : row.action === "refunded" || row.action === "cancelled" ? "amber"
      : row.action === "disputed" ? "red"
      : "default",
  }));
}

function tradeSummary(action: string, sku: string, price: number, userIsBuyer: boolean): string {
  const role = userIsBuyer ? "bought" : "sold";
  const priceStr = `£${price.toFixed(2)}`;
  switch (action) {
    case "created":            return `Trade matched on ${sku} (${priceStr} ${role})`;
    case "paid":               return userIsBuyer ? `You paid ${priceStr} for ${sku}` : `Buyer paid ${priceStr} for ${sku}`;
    case "awaiting_shipment":  return `Awaiting seller shipment — ${sku}`;
    case "shipped_to_ctcg":    return `Seller shipped ${sku} to CTCG for verification`;
    case "received_by_ctcg":   return `CTCG received ${sku}`;
    case "verified":           return `CTCG verified ${sku}`;
    case "shipped_to_buyer":   return userIsBuyer ? `${sku} shipped to you` : `${sku} shipped to buyer`;
    case "completed":          return `Trade completed (${priceStr} ${role})`;
    case "disputed":           return `Trade disputed — ${sku}`;
    case "refunded":           return `Trade refunded (${priceStr} ${role})`;
    case "cancelled":          return `Trade cancelled (${priceStr} ${role})`;
    case "evidence_added":     return `Evidence added to ${sku} dispute`;
    case "admin_override":     return `Admin override on ${sku}`;
    default:                   return `Trade event: ${action}`;
  }
}

async function fetchAuctionTransitions(userId: string, limit: number, since: string | null): Promise<JourneyEvent[]> {
  // Auction lifecycle log joined to the auction row to identify the
  // user's role (seller, winner, or bidder via auction_bids). We
  // surface events where the user is either the seller or the winning
  // bidder — non-winning bidders don't get transition events but DO
  // get a synthetic "bid_placed" event from auction_bids (separate
  // query below for clean separation).
  const sinceClause = since ? "AND log.created_at >= $3" : "";
  const params: unknown[] = [userId, limit];
  if (since) params.push(since);
  const r = await query(
    `SELECT log.action, log.created_at, log.reason, log.metadata,
            a.id AS auction_id, a.title, a.winner_user_id, a.seller_user_id,
            a.winner_user_id = $1 AS user_is_winner
       FROM auction_lifecycle_log log
       JOIN auctions a ON a.id = log.auction_id
      WHERE (a.seller_user_id = $1 OR a.winner_user_id = $1) ${sinceClause}
      ORDER BY log.created_at DESC LIMIT $2`,
    params,
  );
  return r.rows.map((row): JourneyEvent => ({
    kind: `auction.${row.action}`,
    summary: auctionSummary(row.action, row.title, row.user_is_winner),
    at: new Date(row.created_at),
    link: `/auctions/${row.auction_id}`,
    group: "auction",
    tone: row.action === "completed" ? "emerald"
      : row.action === "paid" ? "emerald"
      : row.action === "unpaid_lapsed" || row.action === "cancelled" ? "amber"
      : row.action === "ended_with_winner" ? "fuchsia"
      : "default",
  }));
}

function auctionSummary(action: string, title: string, userIsWinner: boolean): string {
  const suffix = `: ${title}`;
  const role = userIsWinner ? "won" : "your auction";
  switch (action) {
    case "ended_with_winner":  return userIsWinner ? `You won the auction${suffix}` : `Auction ended with winner${suffix}`;
    case "ended_no_winner":    return `Auction ended with no winner${suffix}`;
    case "paid":               return userIsWinner ? `Paid for auction${suffix}` : `Buyer paid${suffix}`;
    case "unpaid_lapsed":      return userIsWinner ? `Auction payment window lapsed${suffix}` : `Buyer didn't pay (relisting available)${suffix}`;
    case "seller_shipped":     return `${userIsWinner ? "Seller" : "You"} shipped${suffix}`;
    case "received_by_ctcg":   return `Received by CTCG for inspection${suffix}`;
    case "shipped_to_buyer":   return userIsWinner ? `Card shipped to you${suffix}` : `Card shipped to buyer${suffix}`;
    case "buyer_confirmed":    return userIsWinner ? `You confirmed receipt${suffix}` : `Buyer confirmed receipt${suffix}`;
    case "completed":          return `Auction completed${suffix}`;
    case "cancelled":          return `Auction cancelled${suffix}`;
    case "seller_paid_out":    return `Seller paid out${suffix}`;
    case "approved":           return `Auction approved by admin${suffix}`;
    case "live":               return `Auction went live${suffix}`;
    default:                   return `${action.replace(/_/g, " ")} (${role})${suffix}`;
  }
}

async function fetchOfferTransitions(userId: string, limit: number, since: string | null): Promise<JourneyEvent[]> {
  // Reads market_offer_lifecycle_log for offers where the user was
  // either the buyer or the seller. The role join makes the summary
  // copy directional.
  const sinceClause = since ? "AND log.created_at >= $3" : "";
  const params: unknown[] = [userId, limit];
  if (since) params.push(since);
  const r = await query(
    `SELECT log.action, log.created_at, log.reason, log.metadata,
            o.id AS offer_id, o.offer_price, o.counter_price,
            o.buyer_id = $1 AS user_is_buyer,
            mo.sku, mo.card_name
       FROM market_offer_lifecycle_log log
       JOIN market_offers o ON o.id = log.offer_id
       JOIN market_orders mo ON mo.id = o.ask_order_id
      WHERE (o.buyer_id = $1 OR o.seller_id = $1) ${sinceClause}
      ORDER BY log.created_at DESC LIMIT $2`,
    params,
  );
  return r.rows.map((row): JourneyEvent => ({
    kind: `offer.${row.action}`,
    summary: offerSummary(row.action, row.card_name || row.sku,
      parseFloat(row.offer_price), row.counter_price ? parseFloat(row.counter_price) : null,
      row.user_is_buyer),
    at: new Date(row.created_at),
    link: "/account/offers",
    group: "offer",
    tone: row.action === "accepted" || row.action === "accepted_counter" ? "emerald"
      : row.action === "declined" || row.action === "expired" || row.action === "withdrawn" ? "amber"
      : row.action === "countered" ? "sky"
      : "default",
  }));
}

function offerSummary(action: string, label: string, price: number, counter: number | null, userIsBuyer: boolean): string {
  const priceStr = `£${price.toFixed(2)}`;
  const counterStr = counter !== null ? `£${counter.toFixed(2)}` : "";
  switch (action) {
    case "created":            return userIsBuyer ? `You offered ${priceStr} on ${label}` : `Received ${priceStr} offer on ${label}`;
    case "countered":          return userIsBuyer ? `Seller countered at ${counterStr} on ${label}` : `You countered at ${counterStr} on ${label}`;
    case "accepted":           return userIsBuyer ? `Your ${priceStr} offer accepted on ${label}` : `You accepted ${priceStr} offer on ${label}`;
    case "accepted_counter":   return userIsBuyer ? `You accepted counter ${counterStr} on ${label}` : `Buyer accepted your counter ${counterStr} on ${label}`;
    case "declined":           return userIsBuyer ? `Your ${priceStr} offer declined on ${label}` : `You declined ${priceStr} offer on ${label}`;
    case "withdrawn":          return userIsBuyer ? `You withdrew ${priceStr} offer on ${label}` : `${priceStr} offer withdrawn on ${label}`;
    case "expired":            return `${priceStr} offer expired on ${label}`;
    case "admin_override":     return `Admin override on ${label} offer`;
    default:                   return `Offer event: ${action} on ${label}`;
  }
}

async function fetchReturnTransitions(userId: string, limit: number, since: string | null): Promise<JourneyEvent[]> {
  const sinceClause = since ? "AND log.created_at >= $3" : "";
  const params: unknown[] = [userId, limit];
  if (since) params.push(since);
  const r = await query(
    `SELECT log.action, log.created_at, log.reason, log.metadata,
            ret.id AS return_id, ret.refund_amount,
            ret.buyer_id = $1 AS user_is_buyer,
            t.sku, COALESCE(o.card_name, t.sku) AS card_name
       FROM market_return_lifecycle_log log
       JOIN market_returns ret ON ret.id = log.return_id
       JOIN market_trades t ON t.id = ret.trade_id
       LEFT JOIN market_orders o ON o.id = t.bid_order_id
      WHERE (ret.buyer_id = $1 OR ret.seller_id = $1) ${sinceClause}
      ORDER BY log.created_at DESC LIMIT $2`,
    params,
  );
  return r.rows.map((row): JourneyEvent => ({
    kind: `return.${row.action}`,
    summary: returnSummary(row.action, row.card_name, row.refund_amount ? parseFloat(row.refund_amount) : null, row.user_is_buyer),
    at: new Date(row.created_at),
    link: "/account/returns",
    group: "return",
    tone: row.action === "refunded" ? "emerald"
      : row.action === "declined" || row.action === "expired" || row.action === "cancelled" ? "amber"
      : row.action === "received" || row.action === "accepted" ? "sky"
      : "default",
  }));
}

function returnSummary(action: string, label: string, refund: number | null, userIsBuyer: boolean): string {
  const refundStr = refund !== null ? `£${refund.toFixed(2)}` : "";
  switch (action) {
    case "requested":          return userIsBuyer ? `You requested a return on ${label}` : `Buyer requested a return on ${label}`;
    case "accepted":           return userIsBuyer ? `Return accepted on ${label}` : `You accepted return on ${label}`;
    case "declined":           return userIsBuyer ? `Return declined on ${label}` : `You declined return on ${label}`;
    case "shipped_back":       return userIsBuyer ? `You shipped ${label} back` : `Buyer shipped ${label} back`;
    case "received":           return userIsBuyer ? `Seller confirmed receipt of ${label}` : `You confirmed receipt of ${label}`;
    case "refunded":           return `${refundStr} refund issued on ${label}`;
    case "cancelled":          return `Return cancelled on ${label}`;
    case "expired":            return `Return request expired on ${label}`;
    case "admin_override":     return `Admin override on ${label} return`;
    default:                   return `Return event: ${action} on ${label}`;
  }
}

async function fetchLotTransitions(userId: string, limit: number, since: string | null): Promise<JourneyEvent[]> {
  // Reads market_lot_lifecycle_log via two LEFT JOINs (lot OR lot_trade
  // — exactly one is non-null per row). User is matched on either side.
  const sinceClause = since ? "AND log.created_at >= $3" : "";
  const params: unknown[] = [userId, limit];
  if (since) params.push(since);
  const r = await query(
    `SELECT log.action, log.created_at, log.reason, log.metadata,
            log.lot_id, log.lot_trade_id,
            COALESCE(l.title, l2.title) AS title,
            COALESCE(l.price, lt.price) AS price,
            CASE
              WHEN lt.buyer_user_id = $1 THEN 'buyer'
              WHEN l.seller_user_id = $1 OR l2.seller_user_id = $1 THEN 'seller'
              ELSE 'unknown'
            END AS role
       FROM market_lot_lifecycle_log log
       LEFT JOIN market_lots l ON l.id = log.lot_id
       LEFT JOIN market_lot_trades lt ON lt.id = log.lot_trade_id
       LEFT JOIN market_lots l2 ON l2.id = lt.lot_id
      WHERE (l.seller_user_id = $1 OR l2.seller_user_id = $1
             OR lt.buyer_user_id = $1) ${sinceClause}
      ORDER BY log.created_at DESC LIMIT $2`,
    params,
  );
  return r.rows.map((row): JourneyEvent => ({
    kind: `lot.${row.action}`,
    summary: lotSummary(row.action, row.title || "lot",
      row.price ? parseFloat(row.price) : null, row.role as "buyer" | "seller" | "unknown"),
    at: new Date(row.created_at),
    link: row.lot_id ? `/market/lots/${row.lot_id}` : "/account/trades",
    group: "lot",
    tone: row.action === "completed" || row.action === "paid" ? "emerald"
      : row.action === "cancelled" || row.action === "trade_cancelled" || row.action === "refunded" ? "amber"
      : row.action === "sold" ? "fuchsia"
      : "default",
  }));
}

async function fetchAutomationTransitions(userId: string, limit: number, since: string | null): Promise<JourneyEvent[]> {
  // Three sources collapsed via UNION ALL into one render: pricing
  // rules (seller automation), saved searches (buyer automation),
  // watch/alerts (buyer automation). Each carries a synthesized
  // summary so the journey row is self-describing without per-source
  // joins on the timeline side.
  const sinceClause = since ? "AND t.created_at >= $3" : "";
  const params: unknown[] = [userId, limit];
  if (since) params.push(since);
  const r = await query(
    `SELECT t.kind, t.action, t.created_at, t.summary, t.link
       FROM (
         SELECT 'rule'::text AS kind, log.action, log.created_at,
                ('Rule "' || pr.name || '" ' || log.action) AS summary,
                '/account/pricing-rules' AS link
           FROM pricing_rule_lifecycle_log log
           JOIN pricing_rules pr ON pr.id = log.rule_id
          WHERE pr.user_id = $1
         UNION ALL
         SELECT 'search'::text AS kind, log.action, log.created_at,
                ('Search "' || ss.name || '" ' || log.action) AS summary,
                '/account/searches' AS link
           FROM saved_search_lifecycle_log log
           JOIN saved_searches ss ON ss.id = log.search_id
          WHERE ss.user_id = $1
         UNION ALL
         SELECT 'alert'::text AS kind, log.action, log.created_at,
                CASE
                  WHEN log.action = 'alert_fired' THEN 'Alert fired: ' || COALESCE(log.sku, 'card')
                  WHEN log.action = 'alert_created' THEN 'Alert created on ' || COALESCE(log.sku, 'card')
                  WHEN log.action = 'alert_deleted' THEN 'Alert deleted on ' || COALESCE(log.sku, 'card')
                  WHEN log.action = 'watch_added' THEN 'Started watching ' || COALESCE(log.sku, 'card')
                  WHEN log.action = 'watch_removed' THEN 'Stopped watching ' || COALESCE(log.sku, 'card')
                  ELSE log.action
                END AS summary,
                '/account/watchlist' AS link
           FROM watch_alert_lifecycle_log log
          WHERE log.user_id = $1
       ) t
      WHERE 1=1 ${sinceClause}
      ORDER BY t.created_at DESC LIMIT $2`,
    params,
  );
  return r.rows.map((row): JourneyEvent => ({
    kind: `${row.kind}.${row.action}`,
    summary: row.summary,
    at: new Date(row.created_at),
    link: row.link,
    group: "automation",
    tone: row.action === "fired" || row.action === "alert_fired" || row.action === "matched_notified" ? "sky"
      : row.action === "expired" || row.action === "archived" || row.action === "alert_deleted" ? "amber"
      : "default",
  }));
}

// ── The platform's two voices ──────────────────────────────────────────
//
// notifications: the in-app bell. Rendered as group='notice' with tone
//   'sky' for unread (eye-catching) and 'default' for read. The link
//   on each row goes to the notification's own link_url when present
//   (the bell knew where it wanted to send the user) or to
//   /account/notifications as a fallback.
//
// email_queue (sent): the inbox. Rendered as group='message' with the
//   event vocabulary (vault_expiring_soon, streak_at_risk, …) made
//   human via emailEventSummary below. We surface only `status='sent'`
//   rows — pending/dead/cancelled aren't part of the user's history,
//   they're admin substrate. The `sent_at` timestamp is what defines
//   "in the inbox at this moment."
//
// Both queries are resilient to schema absence via Promise.allSettled
// in getUserJourney — if the tables don't exist in a given environment,
// the journey still composes from the substrate sources and these two
// rejections get logged. See header § "The three voices."

async function fetchNotifications(userId: string, limit: number, since: string | null): Promise<JourneyEvent[]> {
  const sinceClause = since ? "AND created_at >= $3" : "";
  const params: unknown[] = [userId, limit];
  if (since) params.push(since);
  const r = await query(
    `SELECT id, kind, title, link_url, read_at, created_at
       FROM notifications
      WHERE user_id = $1 ${sinceClause}
      ORDER BY created_at DESC LIMIT $2`,
    params,
  );
  return r.rows.map((row): JourneyEvent => ({
    kind: `notice.${row.kind}`,
    summary: row.title,
    at: new Date(row.created_at),
    link: row.link_url ?? "/account/notifications",
    group: "notice",
    // Unread notifications are visibly distinct in the timeline.
    // The bell that hasn't been silenced yet stays bright.
    tone: row.read_at ? "default" : "sky",
  }));
}

async function fetchEmailsSent(userId: string, limit: number, since: string | null): Promise<JourneyEvent[]> {
  const sinceClause = since ? "AND sent_at >= $3" : "";
  const params: unknown[] = [userId, limit];
  if (since) params.push(since);
  const r = await query(
    `SELECT id, event, sent_at
       FROM email_queue
      WHERE user_id = $1 AND status = 'sent' AND sent_at IS NOT NULL ${sinceClause}
      ORDER BY sent_at DESC LIMIT $2`,
    params,
  );
  return r.rows.map((row): JourneyEvent => ({
    kind: `message.${row.event}`,
    summary: emailEventSummary(row.event),
    at: new Date(row.sent_at),
    link: "/account/emails",
    group: "message",
    tone: "default",
  }));
}

function emailEventSummary(event: string): string {
  // event values come from email_queue.event — vocabulary defined by
  // each handler in apps/storefront/src/lib/email/handlers/*.ts. Add
  // human translations here as new handlers ship.
  switch (event) {
    case "vault_expiring_soon":   return "Email: vault item expiring soon";
    case "streak_at_risk":        return "Email: your streak is about to break";
    case "portfolio_price_alert": return "Email: portfolio price alert";
    case "wishlist_matched":      return "Email: a wishlisted card just listed";
    case "raffle_winner":         return "Email: you won a raffle";
    case "pull_resolved":         return "Email: bounty pull resolved";
    case "vault_redeemed":        return "Email: vault item shipped";
    case "vault_sold_back":       return "Email: vault sell-back confirmed";
    case "vault_expired":         return "Email: vault item auto-expired";
    default:                      return `Email: ${event.replace(/_/g, " ")}`;
  }
}

function lotSummary(action: string, title: string, price: number | null, role: "buyer" | "seller" | "unknown"): string {
  const priceStr = price !== null ? `£${price.toFixed(2)}` : "";
  const isSeller = role === "seller";
  const isBuyer = role === "buyer";
  switch (action) {
    case "listed":           return `You listed lot: ${title}`;
    case "cancelled":        return `Lot cancelled: ${title}`;
    case "sold":             return isBuyer ? `You bought lot: ${title} (${priceStr})` : `Lot sold: ${title} (${priceStr})`;
    case "trade_created":    return `Lot purchase started: ${title}`;
    case "paid":             return isBuyer ? `You paid ${priceStr} for lot ${title}` : `Buyer paid ${priceStr} for lot ${title}`;
    case "shipped_to_buyer": return isBuyer ? `Lot ${title} shipped to you` : `You shipped lot ${title}`;
    case "completed":        return `Lot trade completed: ${title}`;
    case "refunded":         return `Lot trade refunded: ${title}`;
    case "trade_cancelled":  return `Lot trade cancelled: ${title}`;
    case "admin_override":   return `Admin override on lot ${title}`;
    default:                 return `Lot event: ${action} (${isSeller ? "seller" : isBuyer ? "buyer" : "party"})`;
  }
}
