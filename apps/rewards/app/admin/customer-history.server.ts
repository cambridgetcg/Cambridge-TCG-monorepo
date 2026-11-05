import { rewardStatus } from "~/lib/home-rules";
import { CUSTOMER_ERASED, CUSTOMER_MISSING } from "~/lib/payouts.server";
import type { BuyerOrder, HistoryEntry } from "~/lib/stats.server";
import { formatMoney } from "./format";

/**
 * The buyer panel's words for each ledger entry and order (spec 4.4), as
 * plain strings for the page. Each entry keeps the tier and rate it earned
 * at. Where an entry's money didn't simply move, its detail says what
 * happened, from the ledger and the payout alone:
 * - a take-back Shopify took without saying how much reads "unknown", never
 *   0 (A11-F4);
 * - one that took less shows what it took of what it asked (Ruling 35's
 *   shortfall, with its own adjustment line);
 * - a credit Shopify refused after a send that wasn't clear may have arrived
 *   (A11), and the merchant is told to look in Shopify before answering.
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
  /** Its payout's status, as on Home; null for an adjustment */
  status: string | null;
  detail: string | null;
};

export type OrderLine = {
  id: string;
  name: string;
  /** When Shopify processed the order (paidAt, Ruling 27), in the shop's time zone */
  processed: string;
  total: string;
  cashback: string | null;
  note: string | null;
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
          // Settled from an unclear send (settleUnconfirmed's refusals keep
          // unconfirmedAt or say the buyer is gone): it may have landed first
          return payout.unconfirmedAt !== null || payout.lastError === CUSTOMER_MISSING || payout.lastError === CUSTOMER_ERASED
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
  if (payout.debitedAmount === null) return "Amount taken back: unknown";
  if (payout.debitedAmount.lt(payout.amount)) {
    return `Took back ${formatMoney(payout.debitedAmount, currency)} of ${formatMoney(payout.amount, currency)}; the buyer had spent the rest`;
  }
  return null;
}

/** An adjustment's label, from its key: a take-back's shortfall (Ruling 35), or a payout closed without sending. */
function adjustmentLabel(key: string): string {
  if (key.startsWith("shortfall:")) return "Not taken back: the buyer had spent it";
  if (key.startsWith("close:")) return "Closed without sending";
  return "Adjustment";
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
  if (entry.kind === "adjustment" || !entry.payout) {
    return { ...line, label: entry.kind === "adjustment" ? adjustmentLabel(entry.idempotencyKey) : "Cashback", status: null, detail: null };
  }
  const { payout } = entry;
  if (entry.kind === "reversal") {
    return { ...line, label: "Taken back for a refund", status: rewardStatus("reversal", payout.state), detail: takeBackDetail(payout, entry.currency) };
  }
  return { ...line, label: "Cashback", status: rewardStatus("cashback", payout.state), detail: creditDetail(payout) };
}

/** An order's note when it earned nothing for a reason worth saying. */
function orderNote(order: BuyerOrder): string | null {
  if (order.test) return "Test order";
  if (order.cancelledAt) return "Cancelled";
  if (order.source === "import" || order.noCashbackReason === "before_install") return "From before install";
  return null;
}

export function orderLine(order: BuyerOrder, timezone: string): OrderLine {
  return {
    id: order.id,
    name: order.name,
    processed: formatDay(order.paidAt, timezone),
    total: formatMoney(order.totalAmount, order.currency),
    cashback: order.cashback ? formatMoney(order.cashback.amount, order.cashback.currency) : null,
    note: orderNote(order),
  };
}
