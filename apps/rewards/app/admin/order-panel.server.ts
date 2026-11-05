import type { MerchantAnswer } from "~/lib/payouts.server";
import type { OrderEntry, OrderPanel, OrderRefund } from "~/lib/stats.server";
import { formatDay, payoutDetail } from "./customer-history.server";
import { formatMoney } from "./format";

/**
 * The order panel's words (spec 4.6), as plain strings for the page: each
 * payout's state, the answers a payout that needs a look takes (rule 12),
 * the order's notes and its refunds. The ledger entries read as on the buyer
 * panel (historyLine), so a take-back that fell short says "Took back £0.40
 * of £1.00; the buyer had spent the rest" in both places.
 *
 * The answers are the brief's words for cashback. A take-back takes the
 * same two answers (plan Decision 5) in words that fit it: nothing "arrives"
 * when credit is taken back.
 */

export type AnswerButton = { answer: MerchantAnswer; label: string };

export type Look = {
  heading: string;
  /** Why it needs a look, as on the buyer panel */
  text: string;
  /** What to check first, for one RewardsPro couldn't confirm */
  hint: string | null;
  answers: AnswerButton[];
};

export type PayoutLine = {
  id: string;
  what: "Store credit" | "Take-back";
  /** What it is to move, in the buyer's currency */
  amount: string;
  state: string;
  /** The day it went out, in the shop's time zone */
  sent: string | null;
  attempts: number;
  look: Look | null;
};

export type RefundLine = { date: string; productValue: string; takenBack: string | null; note: string | null };

const STATE: Record<NonNullable<OrderEntry["payout"]>["state"], string> = {
  pending: "Waiting to send",
  held: "Held until its cashback is confirmed",
  sending: "Sending",
  sent: "Sent",
  unconfirmed: "Sent, not confirmed yet",
  needs_look: "Needs a look",
  closed: "Closed",
  nothing_to_send: "Nothing to send",
};

const CHECK_CREDIT = "Check the buyer's store credit in Shopify first. If you already added it by hand, choose It arrived.";
const CHECK_TAKE_BACK = "Check the buyer's store credit in Shopify first. If you already took it back by hand, choose It was taken back.";

function lookOf(entry: OrderEntry, payout: NonNullable<OrderEntry["payout"]>): Look | null {
  if (payout.state !== "needs_look" || payout.lookReason === null) return null;
  const credit = payout.direction === "credit";
  const amount = formatMoney(payout.amount, entry.currency);
  const heading = credit ? `Cashback of ${amount} needs a look` : `Take-back of ${amount} needs a look`;
  const text = payoutDetail(entry) ?? "";
  if (payout.lookReason === "could_not_confirm") {
    return {
      heading,
      text,
      hint: credit ? CHECK_CREDIT : CHECK_TAKE_BACK,
      answers: credit
        ? [
            { answer: "arrived", label: "It arrived" },
            { answer: "not_arrived", label: "It didn't arrive, send it" },
          ]
        : [
            { answer: "arrived", label: "It was taken back" },
            { answer: "not_arrived", label: "It wasn't taken back, try again" },
          ],
    };
  }
  return {
    heading,
    text,
    hint: null,
    answers: [
      { answer: "retry", label: "Retry" },
      { answer: "close", label: credit ? "Close without sending" : "Close without taking back" },
    ],
  };
}

/** Each of the order's payouts, newest first, with the answers one that needs a look takes. */
export function payoutLines(panel: OrderPanel, timezone: string): PayoutLine[] {
  return panel.entries.flatMap((entry) => {
    const { payout } = entry;
    if (!payout) return [];
    return [
      {
        id: payout.id,
        what: payout.direction === "credit" ? ("Store credit" as const) : ("Take-back" as const),
        amount: formatMoney(payout.amount, entry.currency),
        state: STATE[payout.state],
        sent: payout.state === "sent" && payout.sentAt ? formatDay(payout.sentAt, timezone) : null,
        attempts: payout.attempts,
        look: lookOf(entry, payout),
      },
    ];
  });
}

/** What the order itself says about its cashback: a test order, cancelled, or from before install. */
export function orderNotes(panel: OrderPanel): string[] {
  const notes: string[] = [];
  if (panel.test) notes.push("Test order");
  if (panel.cancelledAt) notes.push("Cancelled");
  if (panel.source === "import" || panel.noCashbackReason === "before_install") notes.push("From before install");
  return notes;
}

function refundNote(refund: OrderRefund): string | null {
  // Its value was in the import's quantities already (Ruling 54)
  if (refund.countedAtImport) return "Counted at import";
  if (refund.appliedBeforeCashback) return "Already refunded when RewardsPro recorded the order";
  return null;
}

export function refundLine(refund: OrderRefund, currency: string, timezone: string): RefundLine {
  return {
    date: formatDay(refund.refundedAt, timezone),
    productValue: formatMoney(refund.productAmount, currency),
    takenBack: refund.takenBack ? formatMoney(refund.takenBack.amount, refund.takenBack.currency) : null,
    note: refundNote(refund),
  };
}
