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
 *
 * The hourly check settles what was left unclear (settleUnconfirmed), and
 * the merchant answers what needs a look (answerNeedsLook, rule 12).
 */
import { Prisma, type LedgerEntry, type LookReason, type Payout, type PrismaClient, type SettledBy } from "@prisma/client";
import type { Decimal } from "decimal.js";
import prisma, { databaseSchema } from "~/db.server";
import { Money, floorMoney, fromDb } from "./money";
import type { CreditHistoryResult, CreditRecord, PayoutRail, RailAnswer } from "./ports";

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

// ---------------------------------------------------------------------------
// Settling unclear payouts (rule 9), carried from apps/rewardspro's
// services/stuck-cashback.server.ts (judgeStuckCashback, sendWindow,
// checkStuckCashback), reading payout columns instead of metadata.
//
// A payout left `unconfirmed` (or still `sending` once its claim is over,
// because the function stopped mid-send) may have reached the buyer, so it is
// never sent again blind. Once the claim is finished, the buyer's store
// credit history in Shopify settles a credit. The credit carries no reference
// of ours, so its amount and time are the evidence:
// - landed: `sent`, and the take-backs held meanwhile are released (pending)
//   for the next sendPayout to debit;
// - not landed: back to `pending`, less what the held take-backs took, which
//   then have nothing to send; `nothing_to_send` at 0 (Ruling 22);
// - can't tell: needs a look (`could_not_confirm`);
// - the customer is gone from Shopify (or was erased here): needs a look
//   (`refused`), less the held take-backs, which then have nothing to send;
// - the history can't be read: asked again each hour, and needs a look
//   (`could_not_confirm`) 24 h after the claim.
// A take-back gets no history judge (plan Decision 5): one still `sending`
// after its claim needs a look (`could_not_confirm`) and is never debited
// again on its own.
// ---------------------------------------------------------------------------

/** How far apart the app's and Shopify's clocks may be. */
export const CLOCK_SLACK_MS = 5 * 60 * 1000;
/** How long after its claim a credit can reach Shopify: a function runs for 300 seconds at most. */
export const SEND_WINDOW_MS = 15 * 60 * 1000;
/** How long a history Shopify won't give is asked for again before the merchant is asked. */
const READ_HISTORY_FOR_MS = 24 * 60 * 60 * 1000;
const CUSTOMER_MISSING = "The customer no longer exists in Shopify";

export type Verdict = { outcome: "landed"; credit: CreditRecord } | { outcome: "not_landed" } | { outcome: "unknown"; reason: string };

/**
 * When the credit can have reached Shopify: from the claim, to Shopify's
 * unclear answer to it or, with no answer from this claim, the longest a send
 * can run. Each end widened by the clock slack.
 */
function sendWindow(claimedAt: Date, unconfirmedAt: Date | null): { from: Date; to: Date } {
  // An unclear answer counts only when it came after this claim's send.
  const answered = unconfirmedAt !== null && unconfirmedAt >= claimedAt ? unconfirmedAt : null;
  return {
    from: new Date(claimedAt.getTime() - CLOCK_SLACK_MS),
    to: new Date(answered !== null ? answered.getTime() + CLOCK_SLACK_MS : claimedAt.getTime() + SEND_WINDOW_MS),
  };
}

/**
 * Whether an unclear credit of `amount` in `currency` reached the buyer,
 * from Shopify's store credit history (`credits`, read back to the claim;
 * `complete` false when Shopify would not give all of it).
 * - `not_landed` only when the whole history since the claim holds no
 *   credit of that amount, in any currency;
 * - `landed` only for exactly one credit of that amount in the payout's
 *   currency made while it was being sent, when no other RewardsPro credit
 *   of that amount went to the buyer around then (`ownCreditTimes`);
 * - otherwise `unknown`, with the reason the merchant is shown.
 */
export function judgeUnconfirmed(i: {
  amount: Decimal;
  currency: string;
  claimedAt: Date;
  unconfirmedAt: Date | null;
  credits: CreditRecord[];
  complete: boolean;
  ownCreditTimes: Date[];
}): Verdict {
  const since = i.claimedAt.getTime() - CLOCK_SLACK_MS;
  const sameAmount = i.credits.filter((credit) => credit.createdAt.getTime() >= since && credit.amount.equals(i.amount));
  // An unread page may hold this credit, or another of its amount from when it was sent.
  if (!i.complete) {
    return { outcome: "unknown", reason: "Shopify's store credit history for this customer is too long to read back to when it was sent" };
  }
  if (sameAmount.length === 0) return { outcome: "not_landed" };

  const window = sendWindow(i.claimedAt, i.unconfirmedAt);
  const candidates = sameAmount.filter(
    (credit) => credit.createdAt >= window.from && credit.createdAt <= window.to && credit.currency === i.currency,
  );
  if (candidates.length !== 1) {
    return {
      outcome: "unknown",
      reason:
        candidates.length === 0
          ? "Shopify holds a credit of this amount, but not from when this one was sent"
          : "Shopify holds several credits of this amount from when this one was sent",
    };
  }
  const nearFrom = window.from.getTime() - SEND_WINDOW_MS;
  const nearTo = window.to.getTime() + SEND_WINDOW_MS;
  if (i.ownCreditTimes.some((time) => time.getTime() >= nearFrom && time.getTime() <= nearTo)) {
    return { outcome: "unknown", reason: "RewardsPro sent this customer another credit of this amount at the same time" };
  }
  return { outcome: "landed", credit: candidates[0] };
}

/** When the claim began: the later of the claim and Shopify's unclear answer to it. */
function claimStart(claimedAt: Date, unconfirmedAt: Date | null): Date {
  return unconfirmedAt !== null && unconfirmedAt > claimedAt ? unconfirmedAt : claimedAt;
}

/** A payout with its ledger entry, read under its row lock. */
export type LockedPayout = Payout & { ledgerEntry: LedgerEntry };

async function lockRow(tx: Prisma.TransactionClient, table: "payout" | "orders", id: string): Promise<void> {
  await tx.$executeRaw`SELECT id FROM ${Prisma.raw(`"${databaseSchema}"."${table}"`)} WHERE id = ${id}::uuid FOR UPDATE`;
}

/**
 * Lock a payout's row, then its order's: the order recordRefund locks them
 * in, so a refund and a change to the payout apply one after the other.
 * Returns the payout as it is under the lock, or null when there is none.
 */
export async function lockPayout(tx: Prisma.TransactionClient, payoutId: string): Promise<LockedPayout | null> {
  await lockRow(tx, "payout", payoutId);
  const payout = await tx.payout.findUnique({ where: { id: payoutId }, include: { ledgerEntry: true } });
  if (payout?.ledgerEntry.orderId) await lockRow(tx, "orders", payout.ledgerEntry.orderId);
  return payout;
}

/** The take-backs of a credit's order waiting as `held` until the credit is settled. */
function heldTakeBacks(tx: Prisma.TransactionClient, credit: LockedPayout) {
  const orderId = credit.ledgerEntry.orderId;
  return orderId === null
    ? Promise.resolve([])
    : tx.payout.findMany({
        where: { merchantId: credit.merchantId, direction: "debit", state: "held", ledgerEntry: { orderId, kind: "reversal" } },
        select: { id: true, amount: true },
      });
}

/** The credit reached the buyer: its held take-backs are to be debited now. */
async function releaseHeld(tx: Prisma.TransactionClient, credit: LockedPayout, now: Date): Promise<void> {
  const held = await heldTakeBacks(tx, credit);
  if (held.length === 0) return;
  await tx.payout.updateMany({ where: { id: { in: held.map((h) => h.id) }, state: "held" }, data: { state: "pending", nextAttemptAt: now } });
}

/**
 * The credit will not go out as it was (not landed, refused, or closed):
 * take what its held take-backs took off it, as a refund before payout
 * reduces the credit, and each of them then has nothing to send. Returns what
 * is left of the credit; the caller writes it with the credit's next state,
 * which is `nothing_to_send` at 0 (Ruling 22). A take-back holds nothing, so
 * its amount comes back as it is. The caller holds the locks (lockPayout).
 */
async function netHeld(tx: Prisma.TransactionClient, payout: LockedPayout): Promise<Decimal> {
  const amount = fromDb(payout.amount);
  if (payout.direction !== "credit") return amount;
  const held = await heldTakeBacks(tx, payout);
  if (held.length === 0) return amount;
  await tx.payout.updateMany({ where: { id: { in: held.map((h) => h.id) }, state: "held" }, data: { state: "nothing_to_send" } });
  const taken = held.reduce((sum, h) => sum.plus(fromDb(h.amount)), new Money(0));
  return Money.max(0, amount.minus(taken));
}

/** The credit never reached the buyer: send it again, less its held take-backs (netHeld). */
async function sendAgainLessHeld(tx: Prisma.TransactionClient, credit: LockedPayout, now: Date): Promise<void> {
  const left = await netHeld(tx, credit);
  await tx.payout.update({
    where: { id: credit.id },
    data: {
      amount: left.toFixed(),
      state: left.isZero() ? "nothing_to_send" : "pending",
      nextAttemptAt: now,
      unconfirmedAt: null,
      lookReason: null,
    },
  });
}

/**
 * Close a payout without sending it (rule 12's "Close without sending"):
 * `closed`, settled by `settledBy`, with an adjustment entry (key
 * `close:<payout id>`) cancelling what is left of its ledger entry in both
 * currencies: the entry's amount plus, for cashback, its order's reversals
 * and earlier adjustments (a take-back closed before its credit, as
 * customers/redact closes a held one whose credit is still unclear, has
 * cancelled its reversal already).
 * For a credit that is the payout's current amount once its held
 * take-backs are netted into it (netHeld): they have nothing to send, so none
 * stays held for a credit that will never be settled. A credit netted to 0
 * has nothing to send instead (Ruling 22), and needs no adjustment. For a
 * take-back, the adjustment cancels the reversal itself. Nothing is sent or
 * taken back for it again. The caller holds the locks (lockPayout) and has
 * checked the payout may be closed; customers/redact (redactCustomer) closes
 * through this same helper.
 */
export async function closeWithoutSending(
  tx: Prisma.TransactionClient,
  payout: LockedPayout,
  o: { now: Date; settledBy: SettledBy },
): Promise<void> {
  const entry = payout.ledgerEntry;
  const amount = await netHeld(tx, payout);
  const takenOrCancelled =
    entry.kind === "cashback" && entry.orderId !== null
      ? await tx.ledgerEntry.findMany({
          where: { merchantId: entry.merchantId, orderId: entry.orderId, kind: { in: ["reversal", "adjustment"] } },
          select: { amount: true, shopAmount: true },
        })
      : [];
  const left = takenOrCancelled.reduce((sum, r) => sum.plus(fromDb(r.amount)), fromDb(entry.amount));
  const shopLeft = takenOrCancelled.reduce((sum, r) => sum.plus(fromDb(r.shopAmount)), fromDb(entry.shopAmount));
  if (!(left.isZero() && shopLeft.isZero())) {
    await tx.ledgerEntry.create({
      data: {
        merchantId: entry.merchantId,
        connectionId: entry.connectionId,
        customerId: entry.customerId,
        orderId: entry.orderId,
        kind: "adjustment",
        amount: left.neg().toFixed(),
        currency: entry.currency,
        shopAmount: shopLeft.neg().toFixed(),
        tierName: entry.tierName,
        ratePercent: entry.ratePercent,
        idempotencyKey: `close:${payout.id}`,
        createdAt: o.now,
      },
    });
  }
  await tx.payout.update({
    where: { id: payout.id },
    data: { amount: amount.toFixed(), state: amount.isZero() ? "nothing_to_send" : "closed", settledBy: o.settledBy },
  });
}

export type SettleOutcome = "sent" | "returned" | "needs_look" | "waiting";

/**
 * Settle one payout whose send was unclear (see above). Due when it is
 * `sending` or `unconfirmed` and its claim began at least CLAIM_FINISHED_MS
 * before `now`; anything else is `waiting`, and so is a payout that changed
 * while it was being settled. Never sends anything: a released take-back or
 * a credit back to `pending` is sent by the next sendPayout.
 */
export async function settleUnconfirmed(payoutId: string, rail: PayoutRail, now: Date = new Date()): Promise<SettleOutcome> {
  const payout = await prisma.payout.findUnique({
    where: { id: payoutId },
    include: { customer: { select: { externalCustomerId: true } } },
  });
  if (!payout || (payout.state !== "sending" && payout.state !== "unconfirmed")) return "waiting";
  const { claimedAt } = payout;

  // Only while it is as it was read: nothing else moves it on meanwhile.
  const asRead = { id: payout.id, state: payout.state, claimedAt };
  const needsLook = async (lookReason: LookReason, lastError: string): Promise<SettleOutcome> => {
    const written = await prisma.payout.updateMany({ where: asRead, data: { state: "needs_look", lookReason, lastError } });
    return written.count === 1 ? "needs_look" : "waiting";
  };
  /** `change` under the payout's locks, while it is as it was read; `waiting` otherwise. */
  const underLock = (change: (tx: Prisma.TransactionClient, locked: LockedPayout) => Promise<SettleOutcome>) =>
    prisma.$transaction(async (tx): Promise<SettleOutcome> => {
      const locked = await lockPayout(tx, payout.id);
      if (!locked || locked.state !== asRead.state || locked.claimedAt?.getTime() !== claimedAt?.getTime()) return "waiting";
      return change(tx, locked);
    });
  // The credit can't be sent to this buyer (Ruling 14): needs a look
  // (`refused`) at once. What a take-back held meanwhile took comes off it
  // now (netHeld), so a Retry sends only what is left and a Close cancels
  // exactly that; nothing left, and it has nothing to send.
  const refuse = (lastError: string) =>
    underLock(async (tx, locked) => {
      const left = await netHeld(tx, locked);
      if (left.isZero()) {
        await tx.payout.update({ where: { id: locked.id }, data: { amount: left.toFixed(), state: "nothing_to_send", lastError } });
        return "returned";
      }
      await tx.payout.update({ where: { id: locked.id }, data: { amount: left.toFixed(), state: "needs_look", lookReason: "refused", lastError } });
      return "needs_look";
    });

  // Every claim is timed (sendPayout); without one nothing can be judged.
  if (claimedAt === null) return needsLook("could_not_confirm", "RewardsPro has no record of when this was sent");
  const started = claimStart(claimedAt, payout.unconfirmedAt);
  if (now.getTime() - started.getTime() < CLAIM_FINISHED_MS) return "waiting";
  if (payout.direction === "debit") {
    return needsLook("could_not_confirm", "The take-back was being sent and Shopify never said whether it was taken");
  }
  const externalCustomerId = payout.customer.externalCustomerId;
  if (externalCustomerId === null) return refuse("Customer data erased");

  let read: CreditHistoryResult;
  try {
    read = await rail.creditHistory(externalCustomerId, new Date(claimedAt.getTime() - CLOCK_SLACK_MS));
  } catch (error) {
    read = { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
  if (read.status === "failed") {
    if (now.getTime() - started.getTime() < READ_HISTORY_FOR_MS) return "waiting";
    return needsLook("could_not_confirm", `Shopify would not give the buyer's store credit history: ${read.error}`);
  }
  if (read.status === "customer_missing") return refuse(CUSTOMER_MISSING);

  const verdict = judgeUnconfirmed({
    amount: fromDb(payout.amount),
    currency: payout.currency,
    claimedAt,
    unconfirmedAt: payout.unconfirmedAt,
    credits: read.credits,
    complete: read.complete,
    ownCreditTimes: await ownCreditTimes(payout),
  });
  switch (verdict.outcome) {
    case "landed": {
      const { credit } = verdict;
      return underLock(async (tx, locked) => {
        await tx.payout.update({
          where: { id: locked.id },
          data: { state: "sent", sentAt: credit.createdAt, externalTransactionId: credit.id, settledBy: "auto", lastError: null },
        });
        await releaseHeld(tx, locked, now);
        return "sent";
      });
    }
    case "not_landed":
      return underLock(async (tx, locked) => {
        await sendAgainLessHeld(tx, locked, now);
        return "returned";
      });
    case "unknown":
      return needsLook("could_not_confirm", verdict.reason);
  }
}

/** When the buyer's other RewardsPro credits of this amount and currency were recorded, claimed, answered or sent. */
async function ownCreditTimes(payout: Payout): Promise<Date[]> {
  const others = await prisma.payout.findMany({
    where: { customerId: payout.customerId, direction: "credit", id: { not: payout.id }, amount: payout.amount, currency: payout.currency },
    select: { createdAt: true, claimedAt: true, unconfirmedAt: true, sentAt: true },
  });
  return others.flatMap((other) => [other.createdAt, other.claimedAt, other.unconfirmedAt, other.sentAt].filter((time): time is Date => time !== null));
}

// ---------------------------------------------------------------------------
// The merchant's answers (rule 12): the only way out of `needs_look`.
// ---------------------------------------------------------------------------

export type MerchantAnswer = "retry" | "close" | "arrived" | "not_arrived";

/** The look reasons each answer is for. */
const ANSWERS_FOR: Record<MerchantAnswer, readonly LookReason[]> = {
  retry: ["refused", "kept_failing"],
  close: ["refused", "kept_failing"],
  arrived: ["could_not_confirm"],
  not_arrived: ["could_not_confirm"],
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The merchant's answer to a payout that needs a look:
 * - retry (refused or kept failing): `pending` now, the failure clock cleared;
 * - close (the same): closeWithoutSending, settled by the merchant;
 * - arrived (couldn't confirm): `sent`, settled by the merchant, and a
 *   credit's held take-backs are released;
 * - not_arrived (the same): a credit is sent again less its held take-backs
 *   (as settleUnconfirmed's "not landed"); a take-back is `pending` now, to
 *   be debited again from what the buyer holds.
 * `not_found` for a payout that isn't this merchant's;
 * `not_waiting_for_this_answer` when it doesn't need a look of the kind the
 * answer is for (including one already answered).
 */
export async function answerNeedsLook(
  merchantId: string,
  payoutId: string,
  answer: MerchantAnswer,
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "not_waiting_for_this_answer" }> {
  if (!UUID.test(merchantId) || !UUID.test(payoutId)) return { ok: false, reason: "not_found" };
  const ours = await prisma.payout.findFirst({ where: { id: payoutId, merchantId }, select: { id: true } });
  if (!ours) return { ok: false, reason: "not_found" };

  return prisma.$transaction(async (tx) => {
    const payout = await lockPayout(tx, payoutId);
    if (!payout) return { ok: false, reason: "not_found" } as const;
    if (payout.state !== "needs_look" || payout.lookReason === null || !ANSWERS_FOR[answer].includes(payout.lookReason)) {
      return { ok: false, reason: "not_waiting_for_this_answer" } as const;
    }
    switch (answer) {
      case "retry": {
        // Settle's refusals net held take-backs already; one held any other
        // way (a refusal written after its claim finished, when a refund
        // held its take-back) is netted here, so only what is left is sent.
        const left = await netHeld(tx, payout);
        await tx.payout.update({
          where: { id: payout.id },
          data: { amount: left.toFixed(), state: left.isZero() ? "nothing_to_send" : "pending", nextAttemptAt: now, firstFailedAt: null, lookReason: null },
        });
        break;
      }
      case "close":
        await closeWithoutSending(tx, payout, { now, settledBy: "merchant" });
        break;
      case "arrived":
        await tx.payout.update({ where: { id: payout.id }, data: { state: "sent", sentAt: now, settledBy: "merchant" } });
        if (payout.direction === "credit") await releaseHeld(tx, payout, now);
        break;
      case "not_arrived":
        if (payout.direction === "credit") {
          await sendAgainLessHeld(tx, payout, now);
        } else {
          // Nothing was taken: the next send reads the balance and asks again.
          await tx.payout.update({
            where: { id: payout.id },
            data: { state: "pending", nextAttemptAt: now, lookReason: null, debitedAmount: null, shortfall: null },
          });
        }
        break;
    }
    return { ok: true } as const;
  });
}
