/**
 * Moving a payout's money on the store's credit system (spec 6.3 rule 9).
 *
 * A payout is claimed before the rail is called: one conditional UPDATE
 * moves it from `pending` to `sending`, so of two senders at once (the
 * after-response send and the hourly job) only one ever calls the rail.
 * Each answer then decides where it goes:
 * - applied: `sent`;
 * - unclear: a credit is `unconfirmed`, for the hourly check to settle from
 *   the buyer's credit history (A11); a debit needs a look
 *   (`could_not_confirm`, plan Decision 5). Neither is ever sent again blind;
 * - refused for good (plan Decision 4, Ruling 14): needs a look (`refused`)
 *   at once;
 * - refused for now: back to `pending` with backoff (plan Decision 3), until
 *   24 h after the first failure, when it needs a look (`kept_failing`).
 */
import type { Payout, Prisma, PrismaClient } from "@prisma/client";
import type { Decimal } from "decimal.js";
import prisma from "~/db.server";
import { Money, floorMoney, fromDb } from "./money";
import type { PayoutRail, RailAnswer } from "./ports";

/** How long after its claim a send is surely over: the rail's calls time out long before. */
export const CLAIM_FINISHED_MS = 30 * 60 * 1000;
/** How long a payout keeps being retried after its first failure before it needs a look (rule 9). */
export const KEEP_TRYING_MS = 24 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;
const LONGEST_WAIT_HOURS = 8;

export type SendOutcome = "sent" | "pending" | "unconfirmed" | "needs_look" | "skipped";

/**
 * When to try again after the `attempts`-th send failed: min(2^(attempts−1), 8)
 * hours after `from` (plan Decision 3), so retries come about 1, 3, 7, 15 and
 * 23 hours after the first failure. A count below 1 counts as the first.
 */
export function nextAttemptAt(attempts: number, from: Date): Date {
  const n = Number.isFinite(attempts) && attempts >= 1 ? Math.floor(attempts) : 1;
  const hours = Math.min(2 ** (n - 1), LONGEST_WAIT_HOURS);
  return new Date(from.getTime() + hours * HOUR_MS);
}

/** A rail call that threw instead of answering: it may have been sent, so it is unclear. */
async function ask(call: () => Promise<RailAnswer>): Promise<RailAnswer> {
  try {
    return await call();
  } catch (error) {
    return { outcome: "unclear", message: error instanceof Error ? error.message : String(error) };
  }
}

/** What the rail was asked to take on a debit: never more than the buyer holds. */
type Take = { debitedAmount: Decimal; shortfall: Decimal };

/** The payout's next columns for a rail answer, and the outcome they mean. */
function afterAnswer(
  payout: Payout,
  answer: RailAnswer,
  take: Take | null,
  now: Date,
): { outcome: Exclude<SendOutcome, "skipped">; data: Prisma.PayoutUpdateManyMutationInput } {
  const taken = take ? { debitedAmount: take.debitedAmount.toFixed(), shortfall: take.shortfall.toFixed() } : {};
  switch (answer.outcome) {
    case "applied":
      return { outcome: "sent", data: { state: "sent", sentAt: now, externalTransactionId: answer.transactionId, lastError: null, ...taken } };
    case "unclear":
      if (payout.direction === "credit") {
        return { outcome: "unconfirmed", data: { state: "unconfirmed", unconfirmedAt: now, lastError: answer.message } };
      }
      // What was asked for, so the merchant's "It arrived" leaves the true
      // take-back; a resend after "It didn't arrive" writes them again.
      return { outcome: "needs_look", data: { state: "needs_look", lookReason: "could_not_confirm", lastError: answer.message, ...taken } };
    case "refused": {
      // Nothing was taken, whatever an earlier unclear attempt asked for.
      const refusal = { lastError: answer.code ?? answer.message, debitedAmount: null, shortfall: null };
      if (answer.permanent) return { outcome: "needs_look", data: { state: "needs_look", lookReason: "refused", ...refusal } };
      const firstFailedAt = payout.firstFailedAt ?? now;
      if (now.getTime() - firstFailedAt.getTime() >= KEEP_TRYING_MS) {
        return { outcome: "needs_look", data: { state: "needs_look", lookReason: "kept_failing", firstFailedAt, ...refusal } };
      }
      return { outcome: "pending", data: { state: "pending", nextAttemptAt: nextAttemptAt(payout.attempts, now), firstFailedAt, ...refusal } };
    }
  }
}

/**
 * Send one payout if it is `pending` and due at `now`; `skipped` when this
 * call did not claim it (not pending, not due, or another sender has it).
 * A credit goes out with the merchant's buyer-email switch. A debit takes
 * what the buyer still holds of it in the payout currency: none held is
 * `sent` with nothing taken; a balance Shopify can't give is a failure to
 * retry. `db` is the client to run on (tests pass a second one to race two
 * senders).
 */
export async function sendPayout(
  payoutId: string,
  rail: PayoutRail,
  now: Date = new Date(),
  db: PrismaClient = prisma,
): Promise<SendOutcome> {
  // UPDATE … WHERE state = 'pending' AND next_attempt_at <= now RETURNING …:
  // a second sender waits on the row, then finds it `sending` and claims nothing.
  const [payout] = await db.payout.updateManyAndReturn({
    where: { id: payoutId, state: "pending", nextAttemptAt: { lte: now } },
    data: { state: "sending", claimedAt: now, attempts: { increment: 1 } },
  });
  if (!payout) return "skipped";

  const buyer = await db.customer.findUniqueOrThrow({
    where: { id: payout.customerId },
    select: { externalCustomerId: true, merchant: { select: { notifyBuyers: true } } },
  });
  const amount = fromDb(payout.amount);
  const currency = payout.currency;
  const externalCustomerId = buyer.externalCustomerId;

  let answer: RailAnswer;
  let take: Take | null = null;
  if (externalCustomerId === null) {
    // Erased while it waited (customers/redact): there is no one to pay.
    answer = { outcome: "refused", permanent: true, code: null, message: "Customer data erased" };
  } else if (payout.direction === "credit") {
    answer = await ask(() => rail.credit({ externalCustomerId, amount, currency, notify: buyer.merchant.notifyBuyers }));
  } else {
    let balance: Decimal | null;
    try {
      balance = await rail.balance(externalCustomerId, currency);
    } catch {
      balance = null;
    }
    if (balance === null) {
      answer = { outcome: "refused", permanent: false, code: null, message: "The buyer's store credit balance could not be read" };
    } else {
      // Down to the minor unit, so the take is never more than the balance.
      const held = Money.max(floorMoney(balance, currency), 0);
      const debitedAmount = Money.min(amount, held);
      take = { debitedAmount, shortfall: amount.minus(debitedAmount) };
      answer = debitedAmount.isZero()
        ? { outcome: "applied", transactionId: null }
        : await ask(() => rail.debit({ externalCustomerId, amount: debitedAmount, currency }));
    }
  }

  const { outcome, data } = afterAnswer(payout, answer, take, now);
  // Only while this call's claim still holds it.
  const written = await db.payout.updateMany({ where: { id: payout.id, state: "sending", claimedAt: now }, data });
  if (written.count === 0) {
    console.warn(`[payouts] payout ${payout.id} changed while it was being sent; its ${outcome} answer was not written`);
    return "skipped";
  }
  return outcome;
}
