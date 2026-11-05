import { CUSTOMER_ERASED, CUSTOMER_MISSING } from "~/lib/payouts.server";
import type { BuyerOrder, HistoryEntry } from "~/lib/stats.server";
import { formatMoney } from "./format";
import { AMOUNT_UNKNOWN, type BadgeTone, STATUS_LABEL, STATUS_TONE, orderNotes, payoutStatus, takeBackShort } from "./words";

/**
 * The buyer panel's words for each ledger entry and order (spec 4.4), as
 * plain strings for the page, in the pages' shared words (words.ts). Each
 * entry keeps the tier and rate it earned at. Where an entry's money didn't
 * simply move, its detail says what happened, from the ledger and the payout
 * alone:
 * - a take-back Shopify took without saying how much reads AMOUNT_UNKNOWN,
 *   never 0 (A11-F4);
 * - one that took less says the spec's sentence (Ruling 35's shortfall,
 *   with its own adjustment line);
 * - a credit Shopify refused after a send that wasn't clear may have arrived
 *   (A11), and the merchant is told to look in Shopify before answering,
 *   unless the buyer is gone from Shopify (TRUTH-13).
 */

export type HistoryLine = {
  /** The day it was written, in the shop's time zone */
  date: string;
  orderId: string | null;
  orderName: string | null;
  label: string;
  /** Signed, in the buyer's currency */
  amount: string;
  tierName: string | null;
  ratePercent: string | null;
  /** Its payout's status; null for an adjustment */
  status: string | null;
  tone: BadgeTone | null;
  detail: string | null;
};

export type OrderLine = {
  id: string;
  name: string;
  /** When Shopify processed the order (paidAt, Ruling 27), in the shop's time zone */
  processed: string;
  total: string;
  cashback: string | null;
  /** As the Orders page says it (TRUTH-14) */
  status: string;
  tone: BadgeTone;
  notes: string[];
};

/** A day as the admin shows it: "June 5, 2026", in `timezone`. */
export function formatDay(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: timezone }).format(date);
}

/** Why a credit that needs a look does, in words. */
function creditDetail(payout: NonNullable<HistoryEntry["payout"]>): string | null {
  switch (payout.state) {
    case "needs_look":
      switch (payout.lookReason) {
        case "refused":
          // settleUnconfirmed refuses for a buyer gone from Shopify: there is no one to check
          if (payout.lastError === CUSTOMER_MISSING || payout.lastError === CUSTOMER_ERASED) {
            return "The buyer no longer exists in Shopify; close it without sending.";
          }
          // Settled from an unclear send: it may have landed first
          return payout.unconfirmedAt !== null
            ? "Shopify refused it after a send that wasn't clear, so it may have arrived. Check the buyer's store credit in Shopify."
            : "Shopify refused it.";
        case "kept_failing":
          return "Sending kept failing.";
        case "could_not_confirm":
          return "RewardsPro couldn't confirm it arrived.";
        default:
          return null;
      }
    case "nothing_to_send":
      return "A refund cancelled it before it was sent.";
    case "closed":
      return "Closed without sending.";
    default:
      return null;
  }
}

/** What a take-back did, in words. */
function takeBackDetail(payout: NonNullable<HistoryEntry["payout"]>, currency: string): string | null {
  if (payout.state === "needs_look" && payout.lookReason === "could_not_confirm") return "RewardsPro couldn't confirm it was taken back.";
  if (payout.state === "needs_look") return payout.lookReason === "kept_failing" ? "Taking it back kept failing." : "Shopify refused to take it back.";
  if (payout.state === "closed") return "Closed without taking it back.";
  if (payout.state !== "sent") return null;
  if (payout.debitedAmount === null) return AMOUNT_UNKNOWN;
  return takeBackShort(payout.debitedAmount, payout.amount, currency);
}

/**
 * An adjustment's label, from its key and sign: a take-back's shortfall
 * (Ruling 35), or a payout closed without sending. Closing a take-back gives
 * the cashback back to the buyer (+), closing a credit cancels it (−)
 * (TRUTH-4).
 */
function adjustmentLabel(entry: HistoryEntry): string {
  const key = entry.idempotencyKey;
  if (key.startsWith("shortfall:")) return "Couldn't take back: the buyer had spent it";
  if (key.startsWith("close:")) return entry.amount.gt(0) ? "Take-back closed: the buyer keeps it" : "Closed without sending";
  return "Adjustment";
}

/** What happened to an entry's payout, in words: a line's detail (null for an adjustment). */
export function payoutDetail(entry: HistoryEntry): string | null {
  if (entry.kind === "adjustment" || !entry.payout) return null;
  return entry.kind === "reversal" ? takeBackDetail(entry.payout, entry.currency) : creditDetail(entry.payout);
}

export function historyLine(entry: HistoryEntry, timezone: string): HistoryLine {
  const line = {
    date: formatDay(entry.createdAt, timezone),
    orderId: entry.orderId,
    orderName: entry.orderName,
    amount: formatMoney(entry.amount, entry.currency),
    tierName: entry.tierName,
    ratePercent: entry.ratePercent === null ? null : entry.ratePercent.toFixed(),
  };
  if (entry.kind === "adjustment") return { ...line, label: adjustmentLabel(entry), status: null, tone: null, detail: null };
  // A cashback or take-back always has its payout; one without reads Unknown
  const status = payoutStatus(entry.payout);
  return {
    ...line,
    label: entry.kind === "reversal" ? "Taken back for a refund" : "Cashback",
    status: STATUS_LABEL[status],
    tone: STATUS_TONE[status],
    detail: payoutDetail(entry),
  };
}

export function orderLine(order: BuyerOrder, timezone: string): OrderLine {
  return {
    id: order.id,
    name: order.name,
    processed: formatDay(order.paidAt, timezone),
    total: formatMoney(order.totalAmount, order.currency),
    cashback: order.cashback ? formatMoney(order.cashback.amount, order.cashback.currency) : null,
    status: order.status.label,
    tone: STATUS_TONE[order.status.key],
    notes: orderNotes(order),
  };
}
