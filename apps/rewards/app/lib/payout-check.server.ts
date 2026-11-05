/**
 * The hourly payout check (spec 6.3 rules 9 and 13), the body of the
 * api.cron.payouts job, adapted from apps/rewardspro's
 * api.cron.cashback-reconciliation.tsx and reconcileStuckCashback on payout
 * rows. In order, each step stopping at the deadline:
 * 1. Settle payouts whose send was unclear, once their claim is over
 *    (settleUnconfirmed): a credit is judged from the buyer's credit
 *    history, at most MAX_HISTORY_READS reads a run, least recently checked
 *    first; a take-back still being sent needs a look.
 * 2. Send due `pending` payouts created at least MIN_AGE_MS ago (younger ones
 *    are left to their own after-response send), at most MAX_SENDS, the
 *    longest due first. There is no age limit: a payout keeps being retried
 *    with backoff until it is sent or needs a look (rule 9).
 * 3. Sweep each active store for paid orders from the last SWEEP_DAYS (never
 *    before its install) that no webhook recorded, and record each one
 *    through the webhook's own path: read, record, send, resolve the tier.
 *
 * Only active stores are worked on; an uninstalled store's payouts wait for
 * its reinstall (rule 12) or shop/redact. A store the job can't reach (no
 * usable session) is one problem; its payouts are tried against a rail that
 * answers "not sent" (plan Decision 4: transient), so they back off and,
 * after 24 h, need a look, like any other payout that keeps failing, and
 * never hold up the queue. One payout or order failing is a problem, never
 * the end of the run. Nothing about a buyer is logged but ids.
 */
import prisma from "~/db.server";
import { findConnection } from "./merchant.server";
import { CLAIM_FINISHED_MS, type SendOutcome, sendPayout, settleUnconfirmed } from "./payouts.server";
import type { OrderSource, PayoutRail, RailFor } from "./ports";
import { recordOrder } from "./record-order.server";
import { resolveTier } from "./tiers.server";

/** Credit histories read per run (each is one Shopify call). */
export const MAX_HISTORY_READS = 20;
/** Unclear payouts looked at per run. */
const MAX_SETTLE_CANDIDATES = 200;
/** Pending payouts sent per run. */
export const MAX_SENDS = 50;
/** A pending payout younger than this is still its webhook's to send. */
export const MIN_AGE_MS = 2 * 60 * 1000;
/** How far back the sweep looks for paid orders no webhook recorded (rule 13). */
export const SWEEP_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PayoutCheckResult {
  /** Unclear payouts settled: sent, returned to pending or nothing to send, or needing a look. */
  settled: number;
  /** Payouts sent. */
  sent: number;
  /** Payouts that came to need a look in this run. */
  needsLook: number;
  /** Missed orders recorded. */
  swept: number;
  /** Stores, payouts and orders that failed. */
  problems: number;
  firstProblem?: unknown;
}

type Store = { rail: PayoutRail; orders: OrderSource };

const messageOf = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

/** A rail for a store that can't be reached: nothing is sent, and no history can be read. */
function unreachableRail(): PayoutRail {
  const message = "The store could not be reached (no usable session)";
  return {
    credit: async () => ({ outcome: "refused", permanent: false, code: null, message }),
    debit: async () => ({ outcome: "refused", permanent: false, code: null, message }),
    balance: async () => null,
    creditHistory: async () => ({ status: "failed", error: message }),
  };
}

export async function runPayoutCheck(o: { now: Date; railFor: RailFor; deadline: number }): Promise<PayoutCheckResult> {
  const { now } = o;
  const result: PayoutCheckResult = { settled: 0, sent: 0, needsLook: 0, swept: 0, problems: 0 };
  const problem = (error: unknown) => {
    if (result.problems === 0) result.firstProblem = error;
    result.problems++;
  };
  const outOfTime = () => Date.now() >= o.deadline;

  // One railFor per store per run; a store it can't reach is one problem.
  const stores = new Map<string, Promise<Store | null>>();
  const storeFor = (connectionId: string): Promise<Store | null> => {
    let store = stores.get(connectionId);
    if (!store) {
      store = o.railFor(connectionId).then(
        (found) => {
          if (!found) problem(new Error(`The store of connection ${connectionId} could not be reached`));
          return found;
        },
        (error: unknown) => {
          console.error(`[payout-check] Could not reach the store of connection ${connectionId}: ${messageOf(error)}`);
          problem(error);
          return null;
        },
      );
      stores.set(connectionId, store);
    }
    return store;
  };
  const tallySend = (outcome: SendOutcome) => {
    if (outcome === "sent") result.sent++;
    if (outcome === "needs_look") result.needsLook++;
  };
  const activeStore = { ledgerEntry: { connection: { status: "active" as const } } };

  // 1. Settle what was left unclear, once its claim is surely over.
  const claimOver = new Date(now.getTime() - CLAIM_FINISHED_MS);
  const unclear = await prisma.payout.findMany({
    where: {
      state: { in: ["sending", "unconfirmed"] },
      AND: [
        { OR: [{ claimedAt: null }, { claimedAt: { lte: claimOver } }] },
        { OR: [{ unconfirmedAt: null }, { unconfirmedAt: { lte: claimOver } }] },
      ],
      ...activeStore,
    },
    orderBy: [{ lastCheckedAt: { sort: "asc", nulls: "first" } }, { claimedAt: "asc" }, { id: "asc" }],
    take: MAX_SETTLE_CANDIDATES,
    select: { id: true, direction: true, ledgerEntry: { select: { connectionId: true } } },
  });
  let historyReads = 0;
  for (const payout of unclear) {
    if (outOfTime()) break;
    const reachable = await storeFor(payout.ledgerEntry.connectionId);
    // A credit reads the buyer's history; past the cap it waits for the next run, unchecked.
    const readsHistory = payout.direction === "credit" && reachable !== null;
    if (readsHistory && historyReads >= MAX_HISTORY_READS) continue;
    if (readsHistory) historyReads++;
    try {
      await prisma.payout.updateMany({ where: { id: payout.id, state: { in: ["sending", "unconfirmed"] } }, data: { lastCheckedAt: now } });
      const outcome = await settleUnconfirmed(payout.id, reachable?.rail ?? unreachableRail(), now);
      if (outcome !== "waiting") result.settled++;
      if (outcome === "needs_look") result.needsLook++;
    } catch (error) {
      console.error(`[payout-check] Could not settle payout ${payout.id}: ${messageOf(error)}`);
      problem(error);
    }
  }

  // 2. Send what is due.
  const due = await prisma.payout.findMany({
    where: { state: "pending", nextAttemptAt: { lte: now }, createdAt: { lte: new Date(now.getTime() - MIN_AGE_MS) }, ...activeStore },
    orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
    take: MAX_SENDS,
    select: { id: true, ledgerEntry: { select: { connectionId: true } } },
  });
  for (const payout of due) {
    if (outOfTime()) break;
    const store = await storeFor(payout.ledgerEntry.connectionId);
    try {
      // The claim carries the true time of the send, which the history judge reads.
      tallySend(await sendPayout(payout.id, store?.rail ?? unreachableRail(), new Date()));
    } catch (error) {
      console.error(`[payout-check] Could not send payout ${payout.id}: ${messageOf(error)}`);
      problem(error);
    }
  }

  // 3. The missed-order sweep (rule 13).
  const connections = await prisma.connection.findMany({
    where: { status: "active" },
    orderBy: { id: "asc" },
    select: { id: true, externalAccountId: true, installedAt: true },
  });
  for (const connection of connections) {
    if (outOfTime()) break;
    const store = await storeFor(connection.id);
    if (!store) continue;
    const shop = connection.externalAccountId;
    const since = new Date(Math.max(now.getTime() - SWEEP_DAYS * DAY_MS, connection.installedAt.getTime()));
    let missed: string[];
    try {
      const candidates = (await store.orders.recentPaidOrders(since)).filter((order) => order.hasCustomer && !order.test);
      const recorded = await prisma.order.findMany({
        where: { connectionId: connection.id, externalOrderId: { in: candidates.map((order) => order.orderGid) } },
        select: { externalOrderId: true },
      });
      const known = new Set(recorded.map((order) => order.externalOrderId));
      missed = candidates.map((order) => order.orderGid).filter((gid) => !known.has(gid));
    } catch (error) {
      console.error(`[payout-check] Could not list ${shop}'s recent paid orders: ${messageOf(error)}`);
      problem(error);
      continue;
    }
    if (missed.length === 0) continue;
    const conn = await findConnection(shop);
    if (!conn) continue;
    for (const orderGid of missed) {
      if (outOfTime()) break;
      try {
        const facts = await store.orders.readOrder(orderGid, { deadline: o.deadline });
        // Gone from Shopify since it was listed
        if (!facts) continue;
        const recorded = await recordOrder(conn, facts, "live");
        if (recorded.status !== "recorded") continue;
        result.swept++;
        if (recorded.payoutId) tallySend(await sendPayout(recorded.payoutId, store.rail, new Date()));
        await resolveTier(recorded.customerId);
      } catch (error) {
        // One order Shopify's answer can't be read for (OrderReadError) or
        // that fails to record never stops the sweep. Only its id is logged.
        console.error(`[payout-check] Could not record missed order ${orderGid} for ${shop}: ${messageOf(error)}`);
        problem(error);
      }
    }
  }

  return result;
}

