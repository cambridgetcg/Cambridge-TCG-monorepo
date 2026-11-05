import type { NoCashbackReason, PayoutDirection, PayoutState } from "@prisma/client";
import type { Decimal } from "decimal.js";
import { formatMoney } from "./format";

/**
 * One word for each thing, on every page (TRUTH-5, DESIGN-11). Not a .server
 * module: the pages use it too. A status is keyed by the payout's direction
 * and state (StatusKey), never by the words shown, so a copy edit can't drop
 * a tone (A21-F7).
 */

/** A buyer erased by customers/redact: there is no one left to name. */
export const ERASED_BUYER = "Erased buyer";
/** A buyer who holds no tier. */
export const NO_TIER = "No tier";
/** The link to the buyer's own page in Shopify admin. */
export const BUYER_IN_SHOPIFY = "Open the buyer in Shopify";
/** A take-back Shopify confirmed without saying how much it took (A11-F4). */
export const AMOUNT_UNKNOWN = "Amount unknown";
/** The buyer panel's lock button; its select is "Lock to a tier". */
export const LOCK = "Lock";

export type StatusKey = "issued" | "waiting" | "needs_look" | "taken_back" | "not_taken_back" | "no_cashback" | "unknown";

export type BadgeTone = "success" | "warning" | "neutral" | "info";

export const STATUS_LABEL: Record<StatusKey, string> = {
  issued: "Issued",
  waiting: "Waiting",
  needs_look: "Needs a look",
  taken_back: "Taken back",
  not_taken_back: "Not taken back",
  no_cashback: "No cashback",
  unknown: "Unknown",
};

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

const ON_ITS_WAY: ReadonlySet<PayoutState> = new Set(["pending", "sending", "unconfirmed", "held"]);

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
 * The spec's sentence for a take-back that took less than it asked (spec
 * 4.6, Ruling 65), in the cashback's currency; null when it took all of it.
 */
export function takeBackShort(taken: Decimal, asked: Decimal, currency: string): string | null {
  if (!taken.lt(asked)) return null;
  if (taken.isZero()) return `Couldn't take back ${formatMoney(asked, currency)}; the buyer had spent it`;
  return `Took back ${formatMoney(taken, currency)} of ${formatMoney(asked, currency)}; the buyer had spent the rest`;
}

/**
 * A cashback or take-back on Home's Recent rewards: its amount, status and
 * what happened. A sent take-back shows what it really took (its
 * debitedAmount; AMOUNT_UNKNOWN when Shopify never said), so the line agrees
 * with the ledger, which nets the shortfall back (Ruling 35, Ruling 65).
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
