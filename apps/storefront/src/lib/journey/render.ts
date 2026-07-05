/**
 * Journey renderers — substrate → surface.
 *
 * One pure function per LifecycleDomain. Each takes a substrate-shape
 * LifecycleEntry (from the Scribe's bookshelf) and produces a
 * UI-shape JourneyEvent (or null when the entry should be skipped from
 * the customer-facing timeline — e.g. an admin action outside the
 * customer-visible whitelist).
 *
 * Substrate-honest: this file has zero DB access. Everything it needs
 * came from the lifecycle slot's metadata-enriched LifecycleEntry. The
 * separation lets renderers be unit-tested in isolation and lets the
 * substrate layer evolve without touching the surface.
 *
 * See timeline-v2.ts for the composer and docs/connections/the-scribe.md
 * for the architectural motivation. The 700-LOC monolithic timeline.ts
 * is the legacy reader; this file + the expanded registry.ts + the
 * slim timeline-v2.ts together replace it.
 */

import type { LifecycleEntry, LifecycleDomain } from "@/lib/lifecycle";
import type { JourneyEvent } from "./types";

/**
 * Dispatch by domain. Returns null when the entry should be filtered out
 * of the customer-facing journey (admin actions outside the whitelist;
 * future per-domain customer filters).
 */
export function renderEntry(entry: LifecycleEntry): JourneyEvent | null {
  const dispatch: Record<LifecycleDomain, (e: LifecycleEntry) => JourneyEvent | null> = {
    admin_action:   renderAdminAction,
    chargeback:     renderChargeback,
    refund:         renderRefund,
    failed_payment: renderFailedPayment,
    review:         renderReview,
    vault:          renderVault,
    prize:          renderPrize,
    external_rep:   renderExternalRep,
    trade:          renderTrade,
    auction:        renderAuction,
    market_offer:   renderOffer,
    market_return:  renderReturn,
    market_lot:     renderLot,
    pricing_rule:   renderPricingRule,
    saved_search:   renderSavedSearch,
    watch_alert:    renderWatchAlert,
    match:          renderMatch,
    swap:           renderSwap,
  };
  return dispatch[entry.domain](entry);
}

// ── metadata helpers ───────────────────────────────────────────────────
// Tight readers for the JSONB blob the slot stashed extras into. Each
// returns the typed value or a safe fallback. No throwing.

function str(meta: LifecycleEntry["metadata"], key: string): string | null {
  const v = meta?.[key];
  return typeof v === "string" ? v : null;
}

function num(meta: LifecycleEntry["metadata"], key: string): number | null {
  const v = meta?.[key];
  if (typeof v === "number") return v;
  if (typeof v === "string" && v !== "") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function bool(meta: LifecycleEntry["metadata"], key: string): boolean {
  return meta?.[key] === true;
}

function fmtGBP(amount: number | null): string {
  return amount === null ? "" : `£${amount.toFixed(2)}`;
}

// ── admin_action ───────────────────────────────────────────────────────
// Whitelist of admin actions the customer is allowed to see on their own
// journey. Anything outside this set returns null (admin substrate only).
const CUSTOMER_VISIBLE_ADMIN: ReadonlySet<string> = new Set([
  "user.suspend",
  "user.unsuspend",
  "user.auto_suspend",
  "user.trust_override",
  "user.chargeback_received",
]);

function renderAdminAction(e: LifecycleEntry): JourneyEvent | null {
  if (!CUSTOMER_VISIBLE_ADMIN.has(e.action)) return null;
  return {
    kind: `admin.${e.action}`,
    summary: adminSummary(e.action, e.reason),
    at: e.at,
    link: "/account/standing",
    group: "admin",
    tone:
      e.action.includes("suspend") && !e.action.includes("unsuspend")
        ? "red"
        : e.action === "user.unsuspend"
          ? "emerald"
          : "amber",
  };
}

function adminSummary(action: string, reason: string | null): string {
  switch (action) {
    case "user.suspend":             return `Account suspended${reason ? `: ${reason}` : ""}`;
    case "user.auto_suspend":        return `Account auto-suspended${reason ? ` — ${reason}` : ""}`;
    case "user.unsuspend":           return `Account suspension lifted`;
    case "user.trust_override":      return `Trust score adjusted by support`;
    case "user.chargeback_received": return `Chargeback received against your account`;
    default:                         return action.replace(/_/g, " ");
  }
}

// ── chargeback ─────────────────────────────────────────────────────────
function renderChargeback(e: LifecycleEntry): JourneyEvent {
  const amount = num(e.metadata, "amount_gbp");
  return {
    kind: `chargeback.${e.action}`,
    summary: `Chargeback ${fmtGBP(amount)} — ${e.action.replace(/_/g, " ")}`,
    at: e.at,
    link: "/account/chargebacks",
    group: "payment",
    tone:
      e.action === "received" ? "red"
      : e.action === "won"      ? "emerald"
      : "amber",
  };
}

// ── refund ─────────────────────────────────────────────────────────────
function renderRefund(e: LifecycleEntry): JourneyEvent {
  const amount = num(e.metadata, "amount_gbp");
  const status = str(e.metadata, "stripe_status") ?? "—";
  const reason = str(e.metadata, "stripe_reason");
  return {
    kind: `refund.${e.action}`,
    summary: `Refund ${fmtGBP(amount)} — ${status}${reason ? ` (${reason})` : ""}`,
    at: e.at,
    link: "/account/refunds",
    group: "payment",
    tone: status === "succeeded" ? "sky" : "default",
    isAdminOnly: e.action === "abuse_checked",
  };
}

// ── failed_payment ─────────────────────────────────────────────────────
function renderFailedPayment(e: LifecycleEntry): JourneyEvent {
  const amount = num(e.metadata, "amount_gbp");
  const code = str(e.metadata, "failure_code") ?? "unknown";
  return {
    kind: `failed_payment.${e.action}`,
    summary: `Payment ${fmtGBP(amount)} ${e.action} (${code})`,
    at: e.at,
    link: "/account/payment-issues",
    group: "payment",
    tone: "amber",
    isAdminOnly: e.action === "burst_checked",
  };
}

// ── review ─────────────────────────────────────────────────────────────
function renderReview(e: LifecycleEntry): JourneyEvent {
  const rating = num(e.metadata, "rating") ?? 0;
  const role = str(e.metadata, "role") ?? "party";
  const isReviewer = bool(e.metadata, "reviewer_is_user");
  return {
    kind: `review.${e.action}`,
    summary: reviewSummary(e.action, rating, role, isReviewer),
    at: e.at,
    link: "/account/reviews",
    group: "review",
    tone:
      e.action === "submitted" && rating >= 4 ? "emerald"
      : e.action === "hidden"                  ? "amber"
      : "default",
    isAdminOnly: e.actor_label?.startsWith("system:") === true && e.action === "flagged",
  };
}

function reviewSummary(action: string, rating: number, role: string, isReviewer: boolean): string {
  const subject = isReviewer ? "you left" : "you received";
  switch (action) {
    case "submitted":        return `${rating}-star review ${subject} (as ${role})`;
    case "hidden":           return `Review hidden by moderation`;
    case "unhidden":         return `Review restored`;
    case "appealed":         return `You appealed a hidden review`;
    case "appeal_dismissed": return `Appeal dismissed`;
    default:                 return `Review ${action.replace(/_/g, " ")}`;
  }
}

// ── vault ──────────────────────────────────────────────────────────────
function renderVault(e: LifecycleEntry): JourneyEvent {
  const cardName = str(e.metadata, "card_name") ?? "vault item";
  return {
    kind: `vault.${e.action}`,
    summary: vaultSummary(e.action, cardName, e.reason),
    at: e.at,
    link: "/account/vault",
    group: "vault",
    tone:
      e.action === "fulfilled" ? "emerald"
      : e.action === "undone"   ? "amber"
      : "default",
  };
}

function vaultSummary(action: string, cardName: string, notes: string | null): string {
  switch (action) {
    case "fulfilled": return `Shipped: ${cardName}`;
    case "undone":    return `Ship undone: ${cardName}`;
    default:          return `Vault item — ${action.replace(/_/g, " ")}: ${cardName}${notes ? ` (${notes})` : ""}`;
  }
}

// ── prize ──────────────────────────────────────────────────────────────
function renderPrize(e: LifecycleEntry): JourneyEvent {
  const kind = str(e.metadata, "prize_kind") ?? "prize";
  return {
    kind: `prize.${e.action}`,
    summary: `Prize (${kind.replace(/_/g, " ")}) ${e.action.replace(/_/g, " ")}`,
    at: e.at,
    link: "/account/rewards",
    group: "prize",
    tone:
      e.action === "shipped" ? "emerald"
      : e.action === "undone" ? "amber"
      : "default",
  };
}

// ── external_rep ───────────────────────────────────────────────────────
function renderExternalRep(e: LifecycleEntry): JourneyEvent {
  const platform = str(e.metadata, "platform") ?? "platform";
  return {
    kind: `external_rep.${e.action}`,
    summary: extRepSummary(e.action, platform),
    at: e.at,
    link: "/account/external-rep",
    group: "external_rep",
    tone:
      e.action === "verify_succeeded" ? "emerald"
      : e.action.includes("fail") || e.action.includes("decay") ? "amber"
      : "default",
  };
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

// ── trade ──────────────────────────────────────────────────────────────
function renderTrade(e: LifecycleEntry): JourneyEvent {
  const role = str(e.metadata, "role") ?? "unknown";
  const userIsBuyer = role === "buyer";
  const sku = str(e.metadata, "sku") ?? "card";
  const price = num(e.metadata, "price") ?? 0;
  return {
    kind: `trade.${e.action}`,
    summary: tradeSummary(e.action, sku, price, userIsBuyer),
    at: e.at,
    link: `/account/trades/${e.subject_id}`,
    group: "trade",
    tone:
      e.action === "completed" || e.action === "paid" ? "emerald"
      : e.action === "refunded" || e.action === "cancelled" ? "amber"
      : e.action === "disputed" ? "red"
      : "default",
  };
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

// ── auction ────────────────────────────────────────────────────────────
function renderAuction(e: LifecycleEntry): JourneyEvent {
  const title = str(e.metadata, "title") ?? "auction";
  const userIsWinner = bool(e.metadata, "user_is_winner");
  return {
    kind: `auction.${e.action}`,
    summary: auctionSummary(e.action, title, userIsWinner),
    at: e.at,
    link: `/auctions/${e.subject_id}`,
    group: "auction",
    tone:
      e.action === "completed" || e.action === "paid" ? "emerald"
      : e.action === "unpaid_lapsed" || e.action === "cancelled" ? "amber"
      : e.action === "ended_with_winner" ? "fuchsia"
      : "default",
  };
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

// ── offer ──────────────────────────────────────────────────────────────
function renderOffer(e: LifecycleEntry): JourneyEvent {
  const userIsBuyer = bool(e.metadata, "user_is_buyer");
  const offerPrice = num(e.metadata, "offer_price") ?? 0;
  const counterPrice = num(e.metadata, "counter_price");
  const label = str(e.metadata, "card_name") ?? str(e.metadata, "sku") ?? "card";
  return {
    kind: `offer.${e.action}`,
    summary: offerSummary(e.action, label, offerPrice, counterPrice, userIsBuyer),
    at: e.at,
    link: "/account/offers",
    group: "offer",
    tone:
      e.action === "accepted" || e.action === "accepted_counter" ? "emerald"
      : e.action === "declined" || e.action === "expired" || e.action === "withdrawn" ? "amber"
      : e.action === "countered" ? "sky"
      : "default",
  };
}

function offerSummary(action: string, label: string, price: number, counter: number | null, userIsBuyer: boolean): string {
  const priceStr = `£${price.toFixed(2)}`;
  const counterStr = counter !== null ? `£${counter.toFixed(2)}` : "";
  switch (action) {
    case "created":          return userIsBuyer ? `You offered ${priceStr} on ${label}` : `Received ${priceStr} offer on ${label}`;
    case "countered":        return userIsBuyer ? `Seller countered at ${counterStr} on ${label}` : `You countered at ${counterStr} on ${label}`;
    case "accepted":         return userIsBuyer ? `Your ${priceStr} offer accepted on ${label}` : `You accepted ${priceStr} offer on ${label}`;
    case "accepted_counter": return userIsBuyer ? `You accepted counter ${counterStr} on ${label}` : `Buyer accepted your counter ${counterStr} on ${label}`;
    case "declined":         return userIsBuyer ? `Your ${priceStr} offer declined on ${label}` : `You declined ${priceStr} offer on ${label}`;
    case "withdrawn":        return userIsBuyer ? `You withdrew ${priceStr} offer on ${label}` : `${priceStr} offer withdrawn on ${label}`;
    case "expired":          return `${priceStr} offer expired on ${label}`;
    case "admin_override":   return `Admin override on ${label} offer`;
    default:                 return `Offer event: ${action} on ${label}`;
  }
}

// ── return ─────────────────────────────────────────────────────────────
function renderReturn(e: LifecycleEntry): JourneyEvent {
  const userIsBuyer = bool(e.metadata, "user_is_buyer");
  const refund = num(e.metadata, "refund_amount");
  const label = str(e.metadata, "card_name") ?? "card";
  return {
    kind: `return.${e.action}`,
    summary: returnSummary(e.action, label, refund, userIsBuyer),
    at: e.at,
    link: "/account/returns",
    group: "return",
    tone:
      e.action === "refunded" ? "emerald"
      : e.action === "declined" || e.action === "expired" || e.action === "cancelled" ? "amber"
      : e.action === "received" || e.action === "accepted" ? "sky"
      : "default",
  };
}

function returnSummary(action: string, label: string, refund: number | null, userIsBuyer: boolean): string {
  const refundStr = refund !== null ? `£${refund.toFixed(2)}` : "";
  switch (action) {
    case "requested":      return userIsBuyer ? `You requested a return on ${label}` : `Buyer requested a return on ${label}`;
    case "accepted":       return userIsBuyer ? `Return accepted on ${label}` : `You accepted return on ${label}`;
    case "declined":       return userIsBuyer ? `Return declined on ${label}` : `You declined return on ${label}`;
    case "shipped_back":   return userIsBuyer ? `You shipped ${label} back` : `Buyer shipped ${label} back`;
    case "received":       return userIsBuyer ? `Seller confirmed receipt of ${label}` : `You confirmed receipt of ${label}`;
    case "refunded":       return `${refundStr} refund issued on ${label}`;
    case "cancelled":      return `Return cancelled on ${label}`;
    case "expired":        return `Return request expired on ${label}`;
    case "admin_override": return `Admin override on ${label} return`;
    default:               return `Return event: ${action} on ${label}`;
  }
}

// ── lot ────────────────────────────────────────────────────────────────
function renderLot(e: LifecycleEntry): JourneyEvent {
  const title = str(e.metadata, "title") ?? "lot";
  const price = num(e.metadata, "price");
  const role = (str(e.metadata, "role") ?? "unknown") as "buyer" | "seller" | "unknown";
  const lotId = str(e.metadata, "lot_id");
  return {
    kind: `lot.${e.action}`,
    summary: lotSummary(e.action, title, price, role),
    at: e.at,
    link: lotId ? `/market/lots/${lotId}` : "/account/trades",
    group: "lot",
    tone:
      e.action === "completed" || e.action === "paid" ? "emerald"
      : e.action === "cancelled" || e.action === "trade_cancelled" || e.action === "refunded" ? "amber"
      : e.action === "sold" ? "fuchsia"
      : "default",
  };
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

// ── automation: pricing_rule + saved_search + watch_alert ──────────────
// Three separate slots, three small renderers, all in the "automation"
// group so customer-facing filters can show them together.

function renderPricingRule(e: LifecycleEntry): JourneyEvent {
  const name = str(e.metadata, "rule_name") ?? "rule";
  return {
    kind: `rule.${e.action}`,
    summary: `Rule "${name}" ${e.action}`,
    at: e.at,
    link: "/account/pricing-rules",
    group: "automation",
    tone:
      e.action === "fired" ? "sky"
      : e.action === "expired" || e.action === "archived" ? "amber"
      : "default",
  };
}

function renderSavedSearch(e: LifecycleEntry): JourneyEvent {
  const name = str(e.metadata, "search_name") ?? "search";
  return {
    kind: `search.${e.action}`,
    summary: `Search "${name}" ${e.action}`,
    at: e.at,
    link: "/account/searches",
    group: "automation",
    tone:
      e.action === "matched_notified" ? "sky"
      : e.action === "expired" || e.action === "archived" ? "amber"
      : "default",
  };
}

function renderWatchAlert(e: LifecycleEntry): JourneyEvent {
  const sku = str(e.metadata, "sku") ?? "card";
  return {
    kind: `alert.${e.action}`,
    summary: watchAlertSummary(e.action, sku),
    at: e.at,
    link: "/account/watchlist",
    group: "automation",
    tone:
      e.action === "alert_fired" ? "sky"
      : e.action === "alert_deleted" ? "amber"
      : "default",
  };
}

function watchAlertSummary(action: string, sku: string): string {
  switch (action) {
    case "alert_fired":    return `Alert fired: ${sku}`;
    case "alert_created":  return `Alert created on ${sku}`;
    case "alert_deleted":  return `Alert deleted on ${sku}`;
    case "watch_added":    return `Started watching ${sku}`;
    case "watch_removed":  return `Stopped watching ${sku}`;
    default:               return action.replace(/_/g, " ");
  }
}

// ── match ──────────────────────────────────────────────────────────────
// Agent-vs-agent (or agent-vs-human) play events. Sister-shipped domain
// from the playing-module reshaping; the renderer here is the consumer-
// facing journey view. Methodology: /methodology/agents (rating + match
// outcomes); see docs/connections/the-pillow-book.md entries for 2026-05-11
// 23:30 (the playing module) and 23:55 (the operations layer).

function renderMatch(e: LifecycleEntry): JourneyEvent {
  const opponent = str(e.metadata, "opponent") ?? str(e.metadata, "opponent_label") ?? "opponent";
  const result = str(e.metadata, "result"); // "win" | "loss" | "draw" | null
  return {
    kind: `match.${e.action}`,
    summary: matchSummary(e.action, opponent, result),
    at: e.at,
    link: "/account/matches",
    group: "play",
    tone:
      result === "win" ? "emerald"
      : result === "loss" ? "amber"
      : "default",
  };
}

function matchSummary(action: string, opponent: string, result: string | null): string {
  switch (action) {
    case "match_started":   return `Match started vs ${opponent}`;
    case "match_completed": return result ? `Match ${result} vs ${opponent}` : `Match vs ${opponent}`;
    case "match_forfeited": return `Match forfeited vs ${opponent}`;
    case "match_cancelled": return `Match cancelled vs ${opponent}`;
    case "rating_changed":  return `Rating changed after match vs ${opponent}`;
    default:                return action.replace(/_/g, " ");
  }
}

// ── swap ───────────────────────────────────────────────────────────────
// Collector swap proposals (swap_lifecycle_log). Metadata carries the
// viewer's role so summaries read from their side of the table.
function renderSwap(e: LifecycleEntry): JourneyEvent {
  const role = str(e.metadata, "role"); // "proposer" | "recipient" | "unknown"
  return {
    kind: `swap.${e.action}`,
    summary: swapSummary(e.action, role),
    at: e.at,
    link: `/account/swaps/${e.subject_id}`,
    group: "trade",
    tone:
      e.action === "accepted" || e.action === "completed" || e.action === "receipt_confirmed"
        ? "emerald"
      : e.action === "declined" || e.action === "cancelled" || e.action === "expired"
        ? "red"
      : e.action === "shipped" || e.action === "shipping"
        ? "sky"
      : "default",
  };
}

function swapSummary(action: string, role: string | null): string {
  const mine = role === "proposer";
  switch (action) {
    case "created":           return "Swap drafted";
    case "proposed":          return mine ? "Swap proposed" : "Swap proposal received";
    case "countered":         return "Swap counter-proposed";
    case "accepted":          return "Swap accepted";
    case "declined":          return "Swap declined";
    case "cancel_requested":  return "Swap cancellation requested";
    case "cancelled":         return "Swap cancelled";
    case "expired":           return "Swap proposal expired";
    case "address_set":       return "Swap shipping address added";
    case "shipping":          return "Swap moved to shipping — both addresses in";
    case "shipped":           return "Swap parcel marked shipped";
    case "receipt_confirmed": return "Swap receipt confirmed";
    case "completed":         return "Swap completed — both sides received";
    default:                  return `Swap ${action.replace(/_/g, " ")}`;
  }
}
