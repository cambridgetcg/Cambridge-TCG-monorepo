import type { PayoutState } from "@prisma/client";
import type { MerchantAnswer } from "~/lib/payouts.server";
import type { OrderEntry, OrderPanel, OrderRefund } from "~/lib/stats.server";
import { type HistoryLine, formatDay, historyLine, payoutDetail } from "./customer-history.server";
import { formatMoney } from "./format";
import { AMOUNT_UNKNOWN, orderNotes } from "./words";

/**
 * The order panel's words (spec 4.6), as plain strings for the page. The
 * ledger entries read as on the buyer panel (historyLine), so a take-back
 * that fell short says "Took back £0.40 of £1.00; the buyer had spent the
 * rest" in both places. Each payout shows once, in its entry's row, with
 * where it stands and when it went out (DESIGN-13), in words that follow its
 * direction (A22-F4), and the answers a payout that needs a look takes (rule
 * 12).
 *
 * The answers are the brief's words for cashback. A take-back takes the
 * same two answers (plan Decision 5) in words that fit it: nothing "arrives"
 * when credit is taken back (Ruling 55). Every answer but Retry asks first,
 * saying what it does in money words (Ruling 68): a closed payout can't be
 * reopened, and a resend can pay twice.
 */

/** What an answer asks before it is made: a heading, its consequence, and whether it gives up money for good. */
export type Confirm = { heading: string; text: string; critical: boolean };

export type AnswerButton = { answer: MerchantAnswer; label: string; confirm: Confirm | null };

export type Look = {
  heading: string;
  /** Why it needs a look, as on the buyer panel */
  text: string;
  /** What to check first, for one RewardsPro couldn't confirm */
  hint: string | null;
  /** Which send it is about, posted with the answer (Ruling 67) */
  version: string;
  answers: AnswerButton[];
};

/** An entry of the order, with its payout folded in. */
export type EntryLine = HistoryLine & {
  payoutId: string | null;
  /**
   * Where its payout stands, with the day it went out, in the shop's time
   * zone; "Not confirmed" while it may have arrived (sending, unconfirmed,
   * or RewardsPro couldn't confirm it), never "Not sent". Null for an
   * adjustment.
   */
  payout: string | null;
  look: Look | null;
};

export type RefundLine = {
  date: string;
  productValue: string;
  /** What its take-back took, or where it stands; null when it took nothing */
  takenBack: string | null;
  note: string | null;
};

type Payout = NonNullable<OrderEntry["payout"]>;

/** Where a payout stands, in its direction's words (a day is added to a sent one). */
const STATE_WORDS: Record<"credit" | "debit", Record<PayoutState, string>> = {
  credit: {
    pending: "Waiting to send",
    held: "Held until its cashback is confirmed",
    sending: "Not confirmed",
    sent: "Sent",
    unconfirmed: "Not confirmed",
    needs_look: "Not sent",
    closed: "Closed, not sent",
    nothing_to_send: "Nothing to send",
  },
  debit: {
    pending: "Waiting to take back",
    held: "Held until its cashback is confirmed",
    sending: "Not confirmed",
    sent: "Taken back",
    unconfirmed: "Not confirmed",
    needs_look: "Not taken back",
    closed: "Closed, not taken back",
    nothing_to_send: "Nothing to take back",
  },
};

const CHECK_CREDIT = "Check the buyer's store credit in Shopify first. If you already added it by hand, choose It arrived.";
const CHECK_TAKE_BACK = "Check the buyer's store credit in Shopify first. If you already took it back by hand, choose It was taken back.";

function lookOf(entry: OrderEntry, payout: Payout): Look | null {
  if (payout.state !== "needs_look" || payout.lookReason === null) return null;
  const credit = payout.direction === "credit";
  const amount = formatMoney(payout.amount, entry.currency);
  const heading = credit ? `Cashback of ${amount} needs a look` : `Take-back of ${amount} needs a look`;
  const text = payoutDetail(entry) ?? "";
  const { version } = payout;
  const ask = (question: string, consequence: string, critical = false): Confirm => ({ heading: question, text: consequence, critical });
  if (payout.lookReason === "could_not_confirm") {
    return {
      heading,
      text,
      hint: credit ? CHECK_CREDIT : CHECK_TAKE_BACK,
      version,
      answers: credit
        ? [
            {
              answer: "arrived",
              label: "It arrived",
              confirm: ask("Mark it as arrived?", `RewardsPro counts this ${amount} as given and won't send it. If it didn't arrive, the buyer won't get it.`),
            },
            {
              answer: "not_arrived",
              label: "It didn't arrive, send it",
              confirm: ask("Send it again?", `This sends ${amount} again. If the first one arrived, the buyer gets it twice.`),
            },
          ]
        : [
            {
              answer: "arrived",
              label: "It was taken back",
              confirm: ask(
                "Mark it as taken back?",
                `RewardsPro counts this ${amount} as taken back and won't try again. If it wasn't taken, the buyer keeps it.`,
              ),
            },
            {
              answer: "not_arrived",
              label: "It wasn't taken back, try again",
              confirm: ask("Try the take-back again?", `This takes back ${amount} again. If the first one was taken, the buyer loses it twice.`),
            },
          ],
    };
  }
  return {
    heading,
    text,
    hint: null,
    version,
    answers: [
      // Retry sends what Shopify refused or kept failing on: nothing can go out twice, so it doesn't ask
      { answer: "retry", label: "Retry", confirm: null },
      credit
        ? {
            answer: "close",
            label: "Close without sending",
            confirm: ask("Close without sending?", `RewardsPro won't send this ${amount}. You can still add credit by hand in Shopify.`, true),
          }
        : {
            answer: "close",
            label: "Close without taking back",
            confirm: ask("Close without taking back?", `RewardsPro won't take back this ${amount}. You can still take it back by hand in Shopify.`, true),
          },
    ],
  };
}

/**
 * Where a payout stands. One that may have arrived never reads "Not sent":
 * beside "It didn't arrive, send it" that would push the merchant to the
 * answer that pays the buyer twice if the first send landed. A sent
 * take-back that took nothing (the buyer had spent it all) was settled, not
 * taken back.
 */
function payoutCell(payout: Payout, timezone: string): string {
  if (payout.state === "needs_look" && payout.lookReason === "could_not_confirm") return "Not confirmed";
  if (payout.state !== "sent") return STATE_WORDS[payout.direction][payout.state];
  const words = payout.direction === "debit" && payout.debitedAmount?.isZero() ? "Settled" : STATE_WORDS[payout.direction].sent;
  return payout.sentAt ? `${words} ${formatDay(payout.sentAt, timezone)}` : words;
}

/** Each of the order's entries, newest first, each with its payout and the answers one that needs a look takes. */
export function entryLines(panel: OrderPanel, timezone: string): EntryLine[] {
  return panel.entries.map((entry) => {
    const { payout } = entry;
    return {
      ...historyLine(entry, timezone),
      payoutId: payout?.id ?? null,
      payout: payout ? payoutCell(payout, timezone) : null,
      look: payout ? lookOf(entry, payout) : null,
    };
  });
}

/** What the order itself says about its cashback, less what its status already says (A22-F8). */
export function panelNotes(panel: OrderPanel): string[] {
  return orderNotes(panel, panel.status.detail);
}

function refundNote(refund: OrderRefund): string | null {
  // Its value was in the import's quantities already (Ruling 54)
  if (refund.countedAtImport) return "Counted at import";
  if (refund.appliedBeforeCashback) return "Already refunded when RewardsPro recorded the order";
  return null;
}

/**
 * What a refund's take-back took off the buyer's store credit, as the
 * entries say it: what Shopify took when it was sent (AMOUNT_UNKNOWN when
 * Shopify never told, A11-F4), the ledger's amount when it reduced a credit
 * not yet sent, nothing when it was closed, and where it stands while it is
 * on its way or needs a look.
 */
function takenBackCell(takeBack: NonNullable<OrderRefund["takeBack"]>): string {
  switch (takeBack.state) {
    case "sent":
      return takeBack.debitedAmount === null ? AMOUNT_UNKNOWN : formatMoney(takeBack.debitedAmount, takeBack.currency);
    case "closed":
      return "None (closed)";
    case "needs_look":
      return "Needs a look";
    case "pending":
    case "held":
    case "sending":
    case "unconfirmed":
      return "Waiting";
    // nothing_to_send: the credit was sent less, by the ledger's amount.
    // Every reversal is written with its payout, so null does not occur.
    default:
      return formatMoney(takeBack.amount, takeBack.currency);
  }
}

export function refundLine(refund: OrderRefund, currency: string, timezone: string): RefundLine {
  return {
    date: formatDay(refund.refundedAt, timezone),
    productValue: formatMoney(refund.productAmount, currency),
    takenBack: refund.takeBack ? takenBackCell(refund.takeBack) : null,
    note: refundNote(refund),
  };
}
