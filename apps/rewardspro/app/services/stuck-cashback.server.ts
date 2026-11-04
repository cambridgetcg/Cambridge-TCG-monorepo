/**
 * Cashback entries left SYNCING: their store credit was sent, or was about to
 * be, and Shopify's answer never said whether it applied (no answer, a 5xx,
 * an error Shopify can raise after running the mutation), or the function
 * stopped mid-send. Nothing may send such an entry again, since the shopper
 * may have the credit. Refunds of its order are recorded meanwhile, and the
 * cashback they take back waits on the entry as a HELD clawback
 * (services/refund-handler.server.ts).
 *
 * Once the claim is over (CLAIM_FINISHED_MS), the reconciliation cron reads
 * the customer's store credit history in Shopify. The credit carries no
 * reference of ours, so its amount and time are the evidence
 * (judgeStuckCashback):
 * - No credit of that amount since the claim: it never arrived. The entry
 *   goes back to PENDING, less what held refunds took, and is sent again like
 *   any pending cashback.
 * - Exactly one credit of that amount made while the entry was being sent,
 *   and no other RewardsPro credit of that amount to the customer then: it
 *   arrived. The entry becomes SYNCED with that transaction, and the held
 *   refunds take their share back from the shopper's store credit.
 * - Anything else (two such credits, a history too long to read, a deleted
 *   customer): it cannot tell. The entry stays SYNCING, marked needsReview,
 *   and the Orders page asks the merchant to check Shopify.
 * HELD clawbacks exist only while their entry is SYNCING and its claim is
 * over; only this module moves such an entry on, and it settles them in the
 * same transaction.
 */

import { Prisma, type StoreCreditLedger } from "@prisma/client";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import prisma from "~/db.server";
import { jsonObject } from "~/utils/json-object";
import { CLAIM_FINISHED_MS, claimStartedAt, lockLedgerEntry, lockOrder, noteSyncingEntry, parseTime } from "./cashback-ledger.server";
import { settleRefundClawback } from "./refund-handler.server";

const ZERO = new Prisma.Decimal(0);
const CHECKED_BY = "cashback-reconciliation-cron";

/** How far apart the app's and Shopify's clocks may be */
export const CLOCK_SLACK_MS = 5 * 60 * 1000;
/** How long after its claim a credit can reach Shopify: a function runs for 300 seconds at most */
export const SEND_WINDOW_MS = 15 * 60 * 1000;
/** How long a history Shopify would not give is asked for again before the merchant is asked */
export const REVIEW_AFTER_MS = 24 * 60 * 60 * 1000;
/** Store credit histories read per run */
const MAX_CHECKS_PER_RUN = 20;

/** The Admin API client, as far as this module uses it */
export interface GraphqlClient {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<{ json: () => Promise<unknown> }>;
}

export interface ShopifyCredit {
  id: string | null;
  amount: Prisma.Decimal;
  currency: string;
  createdAt: Date;
  /** The account's balance after this credit */
  balanceAfter: Prisma.Decimal | null;
  /** The account's balance now */
  accountBalance: Prisma.Decimal;
}

export interface StoreCreditHistory {
  /** The credit transactions of every store credit account the customer has */
  credits: ShopifyCredit[];
  /** Every account was read, and each one's credits back to the time asked for */
  complete: boolean;
}

export type StoreCreditHistoryResult =
  | { status: "found"; history: StoreCreditHistory }
  | { status: "customer_missing" }
  | { status: "failed"; error: string };

// Newest first. Reading transactions needs read_store_credit_account_transactions,
// which the app's write_store_credit_account_transactions includes.
const STORE_CREDIT_HISTORY_QUERY = `#graphql
  query CustomerStoreCreditHistory($customerId: ID!) {
    customer(id: $customerId) {
      id
      storeCreditAccounts(first: 10) {
        pageInfo {
          hasNextPage
        }
        nodes {
          id
          balance {
            amount
            currencyCode
          }
          transactions(first: 50, reverse: true, query: "type:credit") {
            pageInfo {
              hasNextPage
            }
            nodes {
              __typename
              amount {
                amount
                currencyCode
              }
              balanceAfterTransaction {
                amount
                currencyCode
              }
              createdAt
              ... on StoreCreditAccountCreditTransaction {
                id
              }
            }
          }
        }
      }
    }
  }
`;

interface HistoryAnswer {
  errors?: unknown;
  data?: {
    customer?: {
      storeCreditAccounts?: {
        pageInfo?: { hasNextPage?: boolean };
        nodes?: Array<{
          balance: { amount: string; currencyCode: string };
          transactions?: {
            pageInfo?: { hasNextPage?: boolean };
            nodes?: Array<{
              __typename?: string;
              id?: string;
              amount: { amount: string; currencyCode: string };
              balanceAfterTransaction?: { amount: string } | null;
              createdAt: string;
            }>;
          };
        }>;
      };
    } | null;
  };
}

function firstErrorMessage(errors: unknown): string {
  const list = Array.isArray(errors) ? errors : [];
  const message = (list[0] as { message?: unknown } | undefined)?.message;
  return typeof message === "string" ? message : "Shopify answered with errors";
}

/**
 * The credits Shopify holds for a customer, in every store credit account
 * (one per currency). `since` is how far back they must be read for the
 * history to be complete.
 */
export async function readStoreCreditHistory(admin: GraphqlClient, shopifyCustomerId: string, since: Date): Promise<StoreCreditHistoryResult> {
  let answer: HistoryAnswer;
  try {
    const response = await admin.graphql(STORE_CREDIT_HISTORY_QUERY, { variables: { customerId: `gid://shopify/Customer/${shopifyCustomerId}` } });
    answer = (await response.json()) as HistoryAnswer;
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
  if (answer?.errors) return { status: "failed", error: firstErrorMessage(answer.errors) };
  const customer = answer?.data?.customer;
  if (!customer) return { status: "customer_missing" };

  const accounts = customer.storeCreditAccounts;
  let complete = accounts?.pageInfo?.hasNextPage !== true;
  const credits: ShopifyCredit[] = [];
  for (const account of accounts?.nodes ?? []) {
    const accountBalance = new Prisma.Decimal(account.balance.amount);
    const nodes = account.transactions?.nodes ?? [];
    for (const node of nodes) {
      if (node.__typename !== "StoreCreditAccountCreditTransaction") continue;
      credits.push({
        id: node.id ?? null,
        amount: new Prisma.Decimal(node.amount.amount),
        currency: node.amount.currencyCode,
        createdAt: new Date(node.createdAt),
        balanceAfter: node.balanceAfterTransaction ? new Prisma.Decimal(node.balanceAfterTransaction.amount) : null,
        accountBalance,
      });
    }
    // Newest first: another page holds only older credits
    const oldest = nodes.at(-1)?.createdAt;
    if (account.transactions?.pageInfo?.hasNextPage && !(oldest && new Date(oldest) < since)) complete = false;
  }
  return { status: "found", history: { credits, complete } };
}

/**
 * From when Shopify may hold an entry's credit: its current claim (an earlier
 * claim ended with Shopify applying nothing, or the entry would never have
 * been PENDING again) or, for a claim made before claims were timed, the
 * entry itself.
 */
export function historyStart(entry: Pick<StoreCreditLedger, "createdAt" | "metadata">): Date {
  const claimedAt = parseTime(jsonObject(entry.metadata).claimedAt);
  return new Date((claimedAt ?? entry.createdAt.getTime()) - CLOCK_SLACK_MS);
}

/** When an entry's credit can have reached Shopify, or null when nothing recorded says. */
export function sendWindow(metadata: Prisma.JsonObject): { from: Date; to: Date } | null {
  const claimedAt = parseTime(metadata.claimedAt);
  const answered = parseTime(metadata.unconfirmedAt);
  // Shopify's unclear answer came after the claim's send
  const unconfirmedAt = answered !== null && (claimedAt === null || answered >= claimedAt) ? answered : null;
  if (claimedAt === null && unconfirmedAt === null) return null;
  const from = claimedAt !== null ? claimedAt - CLOCK_SLACK_MS : unconfirmedAt! - SEND_WINDOW_MS;
  const to = unconfirmedAt !== null ? unconfirmedAt + CLOCK_SLACK_MS : claimedAt! + SEND_WINDOW_MS;
  return { from: new Date(from), to: new Date(to) };
}

export type StuckCashbackVerdict =
  | { outcome: "landed"; credit: ShopifyCredit }
  | { outcome: "not_landed" }
  | { outcome: "unknown"; reason: string };

/**
 * Whether a SYNCING entry's credit reached the shopper, from Shopify's store
 * credit history. "not_landed" only when the whole history since the claim
 * holds no credit of the entry's amount, in any currency. "landed" only for
 * exactly one credit of that amount in the shop's currency made while the
 * entry was being sent, when no other RewardsPro credit of that amount went
 * to the customer around then (`ownCreditTimes`). Otherwise "unknown".
 */
export function judgeStuckCashback({
  entry,
  history,
  shopCurrency,
  ownCreditTimes,
}: {
  entry: Pick<StoreCreditLedger, "amount" | "createdAt" | "metadata">;
  history: StoreCreditHistory;
  shopCurrency: string | null;
  /** When other RewardsPro credits of the same amount to this customer were recorded, claimed or issued */
  ownCreditTimes: Date[];
}): StuckCashbackVerdict {
  const since = historyStart(entry);
  const sameAmount = history.credits.filter((credit) => credit.amount.equals(entry.amount) && credit.createdAt >= since);
  if (sameAmount.length === 0) {
    return history.complete
      ? { outcome: "not_landed" }
      : { outcome: "unknown", reason: "Shopify's store credit history for this customer is too long to read back to when it was sent" };
  }

  const window = sendWindow(jsonObject(entry.metadata));
  if (!window) return { outcome: "unknown", reason: "Shopify holds a credit of this amount, and nothing records when this one was sent" };
  const candidates = sameAmount.filter(
    (credit) => credit.createdAt >= window.from && credit.createdAt <= window.to && (!shopCurrency || credit.currency === shopCurrency),
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
  if (ownCreditTimes.some((time) => time.getTime() >= nearFrom && time.getTime() <= nearTo)) {
    return { outcome: "unknown", reason: "RewardsPro sent this customer another credit of this amount at the same time" };
  }
  return { outcome: "landed", credit: candidates[0] };
}

/** When the customer's other RewardsPro credits of `entry`'s amount were recorded, claimed or issued. */
async function otherCreditTimes(entry: Pick<StoreCreditLedger, "id" | "customerId" | "amount">): Promise<Date[]> {
  const others = await prisma.storeCreditLedger.findMany({
    where: { customerId: entry.customerId, id: { not: entry.id }, amount: entry.amount },
    select: { createdAt: true, metadata: true },
  });
  return others.flatMap(({ createdAt, metadata }) => {
    const recorded = jsonObject(metadata);
    return [createdAt.getTime(), parseTime(recorded.claimedAt), parseTime(recorded.syncedAt)]
      .filter((time): time is number => time !== null)
      .map((time) => new Date(time));
  });
}

function heldClawbacks(tx: Prisma.TransactionClient, orderId: string) {
  return tx.storeCreditLedger.findMany({
    where: { orderId, type: "REFUND_CLAWBACK", metadata: { path: ["syncStatus"], equals: "HELD" } },
    select: { id: true, amount: true, metadata: true, refundId: true },
    orderBy: { createdAt: "asc" },
  });
}

function decimalOf(value: unknown, fallback: Prisma.Decimal): Prisma.Decimal {
  return typeof value === "string" || typeof value === "number" ? new Prisma.Decimal(value) : fallback;
}

/**
 * The credit arrived: the entry becomes SYNCED with Shopify's transaction,
 * as the cron records a confirmed credit, and the order's held clawbacks are
 * released (PENDING) to be debited. Null when the entry is no longer SYNCING.
 */
async function markIssued(entryId: string, credit: ShopifyCredit, now: Date): Promise<string[] | null> {
  return prisma.$transaction(async (tx) => {
    await lockLedgerEntry(tx, entryId);
    const entry = await tx.storeCreditLedger.findUniqueOrThrow({ where: { id: entryId } });
    if (entry.orderId) await lockOrder(tx, entry.orderId);
    const metadata = jsonObject(entry.metadata);
    if (metadata.syncStatus !== "SYNCING") return null;

    await tx.storeCreditLedger.update({
      where: { id: entryId },
      data: {
        balance: credit.balanceAfter ?? entry.balance,
        metadata: {
          ...metadata,
          syncStatus: "SYNCED",
          syncedAt: now.toISOString(),
          shopifyTransactionId: credit.id,
          confirmedBy: CHECKED_BY,
          confirmedAt: now.toISOString(),
        },
      },
    });
    await tx.customer.update({ where: { id: entry.customerId }, data: { storeCredit: credit.accountBalance, updatedAt: now } });
    if (!entry.orderId) return [];
    await tx.order.update({ where: { id: entry.orderId }, data: { cashbackProcessed: true, updatedAt: now } });

    // Refunds recorded meanwhile take their share back from the credit the shopper got
    const held = await heldClawbacks(tx, entry.orderId);
    for (const clawback of held) {
      await tx.storeCreditLedger.update({
        where: { id: clawback.id },
        data: { metadata: { ...jsonObject(clawback.metadata), syncStatus: "PENDING", releasedAt: now.toISOString() } },
      });
    }
    return held.map((clawback) => clawback.id);
  });
}

/**
 * The credit never arrived: the entry goes back to PENDING to be sent again.
 * Each held clawback becomes a reduction before issue, as a refund of a
 * PENDING entry is recorded (recordRefund), so only what refunds left is
 * sent. False when the entry is no longer SYNCING.
 */
async function returnToPending(entryId: string, now: Date): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await lockLedgerEntry(tx, entryId);
    const entry = await tx.storeCreditLedger.findUniqueOrThrow({ where: { id: entryId } });
    if (entry.orderId) await lockOrder(tx, entry.orderId);
    const { unconfirmedAt, lastError, ...metadata } = jsonObject(entry.metadata);
    if (metadata.syncStatus !== "SYNCING") return false;

    const held = entry.orderId ? await heldClawbacks(tx, entry.orderId) : [];
    const reversals = held.map((clawback) => ({ clawback, amount: decimalOf(jsonObject(clawback.metadata).reversalAmount, clawback.amount.negated()) }));
    const taken = reversals.reduce((sum, reversal) => sum.plus(reversal.amount), ZERO);
    const amount = Prisma.Decimal.max(ZERO, entry.amount.minus(taken));
    const earlier = Array.isArray(metadata.reversedBeforeIssue) ? metadata.reversedBeforeIssue : [];

    await tx.storeCreditLedger.update({
      where: { id: entryId },
      data: {
        amount,
        metadata: {
          ...metadata,
          syncStatus: amount.gt(0) ? "PENDING" : "NOT_APPLICABLE",
          notCreditedCheck: { checkedBy: CHECKED_BY, checkedAt: now.toISOString(), unconfirmedAt: unconfirmedAt ?? null, lastError: lastError ?? null },
          ...(reversals.length > 0
            ? {
                originalAmount: decimalOf(metadata.originalAmount, entry.amount).toFixed(2),
                reversedBeforeIssue: [
                  ...earlier,
                  ...reversals.map(({ clawback, amount: reversed }) => ({
                    shopifyRefundId: jsonObject(clawback.metadata).shopifyRefundId ?? null,
                    amount: reversed.toFixed(2),
                  })),
                ],
              }
            : {}),
        },
      },
    });
    // Nothing was credited, so nothing is debited: each clawback's share was taken before issue
    for (const { clawback, amount: reversed } of reversals) {
      await tx.storeCreditLedger.update({
        where: { id: clawback.id },
        data: {
          amount: 0,
          metadata: { ...jsonObject(clawback.metadata), syncStatus: "NOT_APPLICABLE", reversalAmount: "0.00", takenBeforeIssue: reversed.toFixed(2) },
        },
      });
      if (clawback.refundId) await tx.orderRefund.update({ where: { id: clawback.refundId }, data: { cashbackProcessed: true } });
    }
    return true;
  });
}

async function markNeedsReview(entryId: string, reason: string, now: Date): Promise<void> {
  await noteSyncingEntry(entryId, { needsReview: true, reviewReason: reason, checkedBy: CHECKED_BY, checkedAt: now.toISOString() });
}

export type StuckCashbackOutcome = "issued" | "returned" | "needsReview" | "waiting";

/**
 * Ask Shopify whether a SYNCING entry whose claim is over got its credit,
 * and move the entry on (see the module comment). The released clawbacks of
 * an entry found issued are debited here.
 */
export async function checkStuckCashback(
  entryId: string,
  { shop, admin, shopCurrency, now }: { shop: string; admin: AdminApiContext; shopCurrency: string | null; now: Date },
): Promise<StuckCashbackOutcome> {
  const entry = await prisma.storeCreditLedger.findUniqueOrThrow({
    where: { id: entryId },
    include: { customer: { select: { shopifyCustomerId: true } } },
  });
  const started = claimStartedAt(jsonObject(entry.metadata));

  const read = await readStoreCreditHistory(admin, entry.customer.shopifyCustomerId, historyStart(entry));
  if (read.status === "failed") {
    if (started && now.getTime() - started.getTime() >= REVIEW_AFTER_MS) {
      await markNeedsReview(entryId, `Shopify would not give the customer's store credit history: ${read.error}`, now);
      return "needsReview";
    }
    await noteSyncingEntry(entryId, { lastCheckedAt: now.toISOString(), lastCheckError: read.error });
    return "waiting";
  }
  const verdict: StuckCashbackVerdict =
    read.status === "customer_missing"
      ? { outcome: "unknown", reason: "The customer no longer exists in Shopify" }
      : judgeStuckCashback({ entry, history: read.history, shopCurrency, ownCreditTimes: await otherCreditTimes(entry) });

  if (verdict.outcome === "landed") {
    const released = await markIssued(entryId, verdict.credit, now);
    if (released === null) return "waiting";
    for (const clawbackId of released) await settleReleasedClawback(clawbackId, shop, admin);
    return "issued";
  }
  if (verdict.outcome === "not_landed") return (await returnToPending(entryId, now)) ? "returned" : "waiting";
  await markNeedsReview(entryId, verdict.reason, now);
  return "needsReview";
}

/** Debit a released clawback; one Shopify turned away stays PENDING for the next run. */
async function settleReleasedClawback(clawbackId: string, shop: string, admin: AdminApiContext): Promise<void> {
  try {
    await settleRefundClawback(clawbackId, { shop, admin });
  } catch (error) {
    console.error(`[StuckCashback] Clawback ${clawbackId} not debited yet:`, error instanceof Error ? error.message : error);
  }
}

export interface StuckCashbackSummary {
  /** Store credit histories read */
  checked: number;
  issued: number;
  returned: number;
  needsReview: number;
  /** Still being sent, or claimed before claims were timed and seen for the first time */
  waiting: number;
  /** No Admin API for the shop, or an error */
  failed: number;
  /** Clawbacks released earlier and debited now */
  clawbacksSettled: number;
}

type Log = (level: string, message: string, data?: Record<string, unknown>) => void;

/**
 * The reconciliation cron's pass over SYNCING cashback in every shop: the
 * entries whose claim is over are checked against Shopify (checkStuckCashback),
 * at most MAX_CHECKS_PER_RUN a run, least recently checked first. An entry
 * claimed before claims were timed is marked seen and checked from then.
 * Clawbacks released by an earlier run that Shopify turned away are debited
 * again first.
 */
export async function reconcileStuckCashback({
  now,
  adminFor,
  log,
}: {
  now: Date;
  adminFor: (shop: string) => Promise<AdminApiContext>;
  log: Log;
}): Promise<StuckCashbackSummary> {
  const summary: StuckCashbackSummary = { checked: 0, issued: 0, returned: 0, needsReview: 0, waiting: 0, failed: 0, clawbacksSettled: 0 };
  const admins = new Map<string, AdminApiContext | null>();
  const adminOf = async (shop: string) => {
    if (!admins.has(shop)) {
      try {
        admins.set(shop, await adminFor(shop));
      } catch (error) {
        log("error", `No Admin API for ${shop}`, { error: error instanceof Error ? error.message : String(error) });
        admins.set(shop, null);
      }
    }
    return admins.get(shop) ?? null;
  };

  const released = await prisma.storeCreditLedger.findMany({
    where: { type: "REFUND_CLAWBACK", metadata: { path: ["syncStatus"], equals: "PENDING" } },
    select: { id: true, shop: true, metadata: true },
    take: 100,
  });
  for (const clawback of released.filter((row) => typeof jsonObject(row.metadata).releasedAt === "string")) {
    const admin = await adminOf(clawback.shop);
    if (!admin) continue;
    await settleReleasedClawback(clawback.id, clawback.shop, admin);
    const after = await prisma.storeCreditLedger.findUniqueOrThrow({ where: { id: clawback.id }, select: { metadata: true } });
    if (jsonObject(after.metadata).syncStatus === "SYNCED") summary.clawbacksSettled++;
  }

  const syncing = await prisma.storeCreditLedger.findMany({
    where: { type: "CASHBACK_EARNED", metadata: { path: ["syncStatus"], equals: "SYNCING" } },
    select: { id: true, shop: true, metadata: true },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  const due: Array<{ id: string; shop: string; lastCheckedAt: number }> = [];
  for (const entry of syncing) {
    const metadata = jsonObject(entry.metadata);
    if (metadata.needsReview === true) continue;
    const started = claimStartedAt(metadata);
    if (!started) {
      // Claimed before claims were timed: wait as long from now
      await noteSyncingEntry(entry.id, { syncingSeenAt: now.toISOString() });
      summary.waiting++;
    } else if (now.getTime() - started.getTime() < CLAIM_FINISHED_MS) {
      summary.waiting++;
    } else {
      due.push({ id: entry.id, shop: entry.shop, lastCheckedAt: parseTime(metadata.lastCheckedAt) ?? 0 });
    }
  }
  due.sort((a, b) => a.lastCheckedAt - b.lastCheckedAt);

  const currencies = new Map(
    (await prisma.shopSettings.findMany({ where: { shop: { in: [...new Set(due.map((entry) => entry.shop))] } }, select: { shop: true, storeCurrency: true } })).map(
      (settings) => [settings.shop, settings.storeCurrency],
    ),
  );
  for (const { id, shop } of due.slice(0, MAX_CHECKS_PER_RUN)) {
    const admin = await adminOf(shop);
    if (!admin) {
      summary.failed++;
      continue;
    }
    try {
      summary.checked++;
      const outcome = await checkStuckCashback(id, { shop, admin, shopCurrency: currencies.get(shop) ?? null, now });
      summary[outcome]++;
      log(outcome === "needsReview" ? "warn" : "info", `Cashback entry ${id} Shopify never confirmed: ${outcome}`, { shop });
    } catch (error) {
      summary.failed++;
      log("error", `Could not check cashback entry ${id} with Shopify`, { shop, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return summary;
}
