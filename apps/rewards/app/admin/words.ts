import type { NoCashbackReason, PayoutDirection, PayoutState, TierWindow } from "@prisma/client";
import type { Decimal } from "decimal.js";
import { AMOUNT_UNKNOWN, ON_ITS_WAY, STATUS_LABEL, type StatusKey, closedWithoutSending, takeBackShort } from "~/lib/status";
import { formatMoney } from "./format";

/**
 * One word for each thing, on every page (TRUTH-5, DESIGN-11). Not a .server
 * module: the pages use it too. A status is keyed by the payout's direction
 * and state (StatusKey), never by the words shown, so a copy edit can't drop
 * a tone (A21-F7). The status keys, labels and take-back sentences are the
 * engine's (lib/status.ts, M3a-F6), re-exported here.
 */

export { AMOUNT_UNKNOWN, STATUS_LABEL, type StatusKey, closedWithoutSending, takeBackShort };

/** A buyer erased by customers/redact: there is no one left to name. */
export const ERASED_BUYER = "Erased buyer";
/** A buyer who holds no tier. */
export const NO_TIER = "No tier";
/** The link to the buyer's own page in Shopify admin. */
export const BUYER_IN_SHOPIFY = "Open the buyer in Shopify";
/** The buyer panel's lock button; its select is "Lock to a tier". */
export const LOCK = "Lock";
/** The export's answer, shown on Customers, when Shopify found more buyers than one search reads (Ruling 63). */
export const SEARCH_TOO_BROAD = "Too many buyers match this search for one file. Narrow the search, or export without one.";
/** Customers, when Shopify warned it couldn't read the search (BOUNDARY-5). */
export const SEARCH_UNREAD = "Shopify couldn't read all of this search, so some buyers may be missing. Try other words.";
/** The export's answer, shown on Customers, when Shopify warned it couldn't read the search (Ruling 79). */
export const EXPORT_SEARCH_UNREAD = "Shopify couldn't read all of this search, so the file could miss buyers. Try other words, or export without a search.";
/** Any page, for an error that isn't one of the app's own answers (BOUNDARY-3). */
export const SOMETHING_WRONG = "Something went wrong. Reload the page.";

/**
 * What cashback is paid on, on Home's rate field and the Tiers page: order-facts.ts
 * cashbackBase (product value after discounts and tips, less store credit and gift
 * cards paid), with gift-card lines valued at 0 (order-source.server.ts parseOrderNode).
 */
export const CASHBACK_BASE =
  "Cashback is paid on the product price after discounts, less anything paid with store credit or gift cards. Shipping, duties, tips and gift cards bought earn nothing.";

/** The tier window's name: what "Spend counted" covers, on every page and in the CSV (MONEY-4). */
export const TIER_WINDOW_LABEL: Record<TierWindow, string> = { rolling_12_months: "Last 12 months", lifetime: "All time" };

export type BadgeTone = "success" | "warning" | "neutral" | "info";

/** The badge tone of each status (spec 4.6). */
export const STATUS_TONE: Record<StatusKey, BadgeTone> = {
  issued: "success",
  waiting: "info",
  needs_look: "warning",
  taken_back: "neutral",
  not_taken_back: "neutral",
  no_cashback: "neutral",
  unknown: "neutral",
};

/**
 * A cashback's or take-back's status, from its own payout. A credit a refund
 * cancelled before it went out (nothing_to_send) was taken back; one closed
 * without sending gave no cashback. A take-back closed without taking, or
 * sent with nothing taken (the buyer had spent it all, Ruling 35), was not
 * taken back. Null is a broken invariant (every cashback and take-back is
 * written with its payout): Unknown.
 */
export function payoutStatus(payout: { direction: PayoutDirection; state: PayoutState; debitedAmount: Decimal | null } | null): StatusKey {
  if (!payout) return "unknown";
  const { direction, state } = payout;
  if (ON_ITS_WAY.has(state)) return "waiting";
  switch (state) {
    case "needs_look":
      return "needs_look";
    case "nothing_to_send":
      return "taken_back";
    case "closed":
      return direction === "debit" ? "not_taken_back" : "no_cashback";
    case "sent":
      if (direction === "credit") return "issued";
      return payout.debitedAmount !== null && payout.debitedAmount.isZero() ? "not_taken_back" : "taken_back";
    default:
      throw new RangeError(`Unknown payout state ${JSON.stringify(state)}`);
  }
}

/**
 * A cashback or take-back on Home's Recent rewards: its amount, status and
 * what happened. A sent take-back shows what it really took (its
 * debitedAmount; AMOUNT_UNKNOWN when Shopify never said), so the line agrees
 * with the ledger, which nets the shortfall back (Ruling 35, Ruling 65). A
 * closed payout moved nothing, and its `close:` entry nets the ledger to 0
 * (MONEY-2): a closed take-back reads 0, as the zero take does, and a closed
 * credit reads 0 with what it didn't send.
 */
export function rewardLine(entry: {
  kind: "cashback" | "reversal";
  amount: Decimal;
  currency: string;
  payout: { direction: PayoutDirection; state: PayoutState; amount: Decimal; debitedAmount: Decimal | null } | null;
}): { amount: string; status: string; tone: BadgeTone; detail: string | null } {
  const status = payoutStatus(entry.payout);
  const words = { status: STATUS_LABEL[status], tone: STATUS_TONE[status] };
  const { payout } = entry;
  if (entry.kind === "reversal" && payout?.direction === "debit" && payout.state === "sent") {
    if (payout.debitedAmount === null) return { amount: AMOUNT_UNKNOWN, ...words, detail: null };
    const taken = payout.debitedAmount;
    return {
      amount: formatMoney(taken.isZero() ? taken : taken.neg(), entry.currency),
      ...words,
      detail: takeBackShort(taken, payout.amount, entry.currency),
    };
  }
  if (payout?.state === "closed") {
    const zero = formatMoney(0, entry.currency);
    return { amount: zero, ...words, detail: payout.direction === "credit" ? closedWithoutSending(payout.amount, entry.currency) : null };
  }
  return { amount: formatMoney(entry.amount, entry.currency), ...words, detail: null };
}

/**
 * What an order itself says about its cashback, on both panels (A22-F7): a
 * test order, cancelled, or from before install. A note the status detail
 * already says is left out (A22-F8).
 */
export function orderNotes(
  order: { test: boolean; cancelledAt: Date | null; source: "live" | "import"; noCashbackReason: NoCashbackReason | null },
  statusDetail: string | null = null,
): string[] {
  const notes: string[] = [];
  if (order.test) notes.push("Test order");
  if (order.cancelledAt) notes.push("Cancelled");
  if (order.source === "import" || order.noCashbackReason === "before_install") notes.push("From before install");
  return notes.filter((note) => note !== statusDetail);
}
