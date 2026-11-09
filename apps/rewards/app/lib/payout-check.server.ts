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
 * 3. Read again refunds recorded with their money still on its way (#195),
 *    at most MAX_MONEY_PENDING_READS a run (a busy store's left out before
 *    they are counted), the least recently read first, then the oldest
 *    refund first, straight from the refund table (not the sweep's 3-day
 *    listing), starting no read once less than MONEY_PENDING_RESERVE_MS of
 *    the run is left: settleRefundMoney adds what has succeeded to spend
 *    and, once the money has succeeded or failed, writes the refund's one
 *    take-back (sent by a later run's step 2, as the sweep's are). One still
 *    pending after MONEY_PENDING_FOR_MS is cleared with what succeeded and
 *    counted as one problem, naming its order by its Shopify name.
 * 4. Sweep each active store, the one least recently swept first (OPERATIONS-6),
 *    for orders updated in the last SWEEP_DAYS (never before its install):
 *    the backstop for orders, refunds and cancellations whose webhooks
 *    failed all of Shopify's retries (rule 13, Ruling 45). An order no
 *    webhook recorded goes through the webhook's own path: read, record,
 *    send, resolve the tier. A recorded order gets each refund it has no row
 *    for (read, then recordRefund, which leaves the spend of an imported
 *    order's refund its bulk file listed as it is, Ruling 54; a take-back is
 *    sent by a later run's step 2), and a cancellation Shopify shows that the
 *    row lacks. A store is stamped (`lastSweptAt`) when its sweep finishes;
 *    one the deadline leaves out or cuts short, its listing included, is
 *    `unfinished`, and a problem. An order past what one read takes (20 or
 *    more refunds) is logged as a limit, not a problem (M2c-F7).
 *
 * Only active stores are worked on; an uninstalled store's payouts wait for
 * its reinstall (rule 12) or shop/redact. A store the job can't reach (no
 * usable session) is one problem; its payouts are tried against a rail that
 * answers "not sent" (plan Decision 4: transient), so they back off and,
 * after 24 h, need a look, like any other payout that keeps failing, and
 * never hold up the queue. One payout or order failing is a problem, never
 * the end of the run: a send turned away for now, left unclear or needing a
 * look, and a settle that ends needing a look, each count (Ruling 46), with
 * the payout's code (`lastError`) as the problem and one log line. Nothing
 * about a buyer is logged but ids.
 */
import type { Prisma } from "@prisma/client";
import prisma from "~/db.server";
import { type ConnectionContext, findConnection } from "./merchant.server";
import type { RefundFacts } from "./order-facts";
import { CLAIM_FINISHED_MS, type SendOutcome, sendPayout, settleUnconfirmed } from "./payouts.server";
import { type OrderSource, type PayoutRail, type RailFor, type UpdatedOrder, isReadLimit } from "./ports";
import { recordCancellation, recordOrder } from "./record-order.server";
import { RefundRetryLater, recordRefund, settleRefundMoney } from "./refunds.server";
import { resolveTier } from "./tiers.server";

/** Credit histories read per run (each is one Shopify call). */
export const MAX_HISTORY_READS = 20;
/** Unclear payouts looked at per run. */
const MAX_SETTLE_CANDIDATES = 200;
/** Pending payouts sent per run. */
export const MAX_SENDS = 50;
/** A pending payout younger than this is still its webhook's to send. */
export const MIN_AGE_MS = 2 * 60 * 1000;
/** How far back the sweep looks at updated orders (rule 13, Ruling 45). */
export const SWEEP_DAYS = 3;
/** Refunds whose money was on its way read again per run (#195; each read is three or more Shopify calls). */
export const MAX_MONEY_PENDING_READS = 20;
/**
 * Step 3 starts no read with less than this left of the run's budget, so
 * the sweep and the import polls after it keep their turn (RP25-F2). Half
 * of the hourly route's 240 s: step 3's own worst case is
 * MAX_MONEY_PENDING_READS reads of 4.5 s (ORDER_READ_DEADLINE_MS), 90 s, so
 * it still has room after steps 1 and 2, and its last read ends with nearly
 * two minutes left for the others.
 */
export const MONEY_PENDING_RESERVE_MS = 120 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long a refund's money may stay on its way before only what succeeded is taken back (#195). */
export const MONEY_PENDING_FOR_MS = 30 * DAY_MS;

export interface PayoutCheckResult {
  /** Unclear payouts settled: sent, returned to pending or nothing to send, or needing a look. */
  settled: number;
  /** Payouts sent. */
  sent: number;
  /** Payouts that came to need a look in this run. */
  needsLook: number;
  /** Missed orders recorded. */
  swept: number;
  /** Refunds of recorded orders no webhook recorded, recorded by the sweep. */
  refundsSwept: number;
  /** Cancellations of recorded orders no webhook recorded, recorded by the sweep. */
  cancelledSwept: number;
  /** Refunds whose money was on its way, settled: their mark cleared and their take-back written (#195). */
  refundsSettled: number;
  /** Active stores the sweep did not finish before the deadline. */
  unfinished: number;
  /** Stores left for the next run because another renewal of their token was running (Ruling 85, F1-F3): no problem. */
  busy: number;
  /** Stores, payouts, orders and refunds that failed, and stores left unswept. */
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

/** A recorded order as the sweep compares it with Shopify. */
type RecordedOrder = { externalOrderId: string; cancelledAt: Date | null; refunds: Array<{ externalRefundId: string }> };

export async function runPayoutCheck(o: { now: Date; railFor: RailFor; deadline: number }): Promise<PayoutCheckResult> {
  const { now } = o;
  const result: PayoutCheckResult = {
    settled: 0,
    sent: 0,
    needsLook: 0,
    swept: 0,
    refundsSwept: 0,
    cancelledSwept: 0,
    refundsSettled: 0,
    unfinished: 0,
    busy: 0,
    problems: 0,
  };
  const problem = (error: unknown) => {
    if (result.problems === 0) result.firstProblem = error;
    result.problems++;
  };
  const outOfTime = () => Date.now() >= o.deadline;

  // One railFor per store per run; a store it can't reach is one problem, and
  // a store whose token another renewal holds is skipped until the next run.
  const stores = new Map<string, Promise<Store | "busy" | null>>();
  const storeFor = (connectionId: string): Promise<Store | "busy" | null> => {
    let store = stores.get(connectionId);
    if (!store) {
      store = o.railFor(connectionId).then(
        (found) => {
          if (found === "busy") result.busy++;
          else if (!found) problem(new Error(`The store of connection ${connectionId} could not be reached`));
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
  /** A payout the run left not sent: one problem, its code as the problem, one log line (Ruling 46). */
  const failedPayout = async (payoutId: string, outcome: string) => {
    const { lastError } = await prisma.payout.findUniqueOrThrow({ where: { id: payoutId }, select: { lastError: true } });
    const code = lastError ?? outcome;
    console.error(`[payout-check] Payout ${payoutId} was not sent (${outcome}): ${code}`);
    problem(code);
  };
  const tallySend = async (payoutId: string, outcome: SendOutcome) => {
    if (outcome === "sent") result.sent++;
    if (outcome === "needs_look") result.needsLook++;
    // Turned away for now (pending again), left unclear, or needing a look
    if (outcome === "pending" || outcome === "unconfirmed" || outcome === "needs_look") await failedPayout(payoutId, outcome);
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
    // Its token is being renewed: settled next run, with no attempt spent
    if (reachable === "busy") continue;
    // A credit reads the buyer's history; past the cap it waits for the next run, unchecked.
    const readsHistory = payout.direction === "credit" && reachable !== null;
    if (readsHistory && historyReads >= MAX_HISTORY_READS) continue;
    if (readsHistory) historyReads++;
    try {
      await prisma.payout.updateMany({ where: { id: payout.id, state: { in: ["sending", "unconfirmed"] } }, data: { lastCheckedAt: now } });
      const outcome = await settleUnconfirmed(payout.id, reachable?.rail ?? unreachableRail(), now);
      if (outcome !== "waiting") result.settled++;
      // A credit found not landed goes back to pending to be sent: no problem
      if (outcome === "needs_look") {
        result.needsLook++;
        await failedPayout(payout.id, outcome);
      }
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
    // Its token is being renewed: sent next run, with no attempt spent
    if (store === "busy") continue;
    try {
      // The claim carries the true time of the send, which the history judge reads.
      await tallySend(payout.id, await sendPayout(payout.id, store?.rail ?? unreachableRail(), new Date()));
    } catch (error) {
      console.error(`[payout-check] Could not send payout ${payout.id}: ${messageOf(error)}`);
      problem(error);
    }
  }

  // 3. Refunds whose money was on its way (#195). A failure of the step
  // itself (its listing of the marked refunds) is one problem, never the end
  // of the run: the sweep and the import polls still have theirs (RP25-F2).
  try {
    await settlePendingRefundMoney({ result, problem, outOfTime, now, deadline: o.deadline, storeFor });
  } catch (error) {
    console.error(`[payout-check] Could not read the refunds whose money was on its way: ${messageOf(error)}`);
    problem(error);
  }

  // 4. The sweep (rule 13, Ruling 45), the store least recently swept first.
  const connections = await prisma.connection.findMany({
    where: { status: "active" },
    orderBy: [{ lastSweptAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
    select: { id: true, externalAccountId: true, installedAt: true, importHorizonDays: true },
  });
  const sweep: SweepContext = { result, problem, outOfTime, now, deadline: o.deadline, tallySend };
  for (const [index, connection] of connections.entries()) {
    if (outOfTime()) {
      const left = connections.length - index;
      result.unfinished += left;
      problem(new Error(`${left} of ${connections.length} stores were not swept before the deadline`));
      break;
    }
    const store = await storeFor(connection.id);
    // Unreachable (a problem counted above) or busy (next run): not stamped as swept
    if (!store || store === "busy") continue;
    const finished = await sweepStore(sweep, connection, store);
    if (finished) await prisma.connection.update({ where: { id: connection.id }, data: { lastSweptAt: new Date() } });
    else {
      result.unfinished++;
      problem(new Error(`The sweep of ${connection.externalAccountId} was cut short by the deadline`));
    }
  }

  return result;
}

/**
 * Step 3 (#195): each refund still marked as having its money on its way,
 * on an active store, read again from Shopify by its id and settled
 * (settleRefundMoney), the least recently read first, then the oldest
 * refund first, so two of one order share what the order has left to refund
 * as readOrder would. A busy store's are left out before the
 * MAX_MONEY_PENDING_READS are taken, so they can't use up the run's reads,
 * and wait unstamped for the next run (P1-F3). No read starts once less
 * than MONEY_PENDING_RESERVE_MS of the run is left; the rest wait unstamped,
 * keeping their place (RP25-F2). Each is stamped (`moneyCheckedAt`) before
 * its read, so one that fails takes its turn after the others; an
 * unreachable store's are stamped and left (storeFor counts the store
 * once). A database error on one refund, its stamp included, is one problem
 * and the next is still read, as in steps 1 and 2. A read that fails is a
 * problem and the refund stays marked (a ReadLimit is only logged), until
 * MONEY_PENDING_FOR_MS after it was marked: then it is settled with what has
 * succeeded, from its read if there is one, else from its stored value, and
 * counted as one problem by its order's Shopify name. A settle the credit's
 * state stops (being sent: RefundRetryLater, left for the next run; or a
 * state a refund can't judge, a problem) leaves it marked. The buyers whose
 * spend moved have their tier resolved once each.
 */
async function settlePendingRefundMoney(ctx: {
  result: PayoutCheckResult;
  problem: (error: unknown) => void;
  outOfTime: () => boolean;
  now: Date;
  deadline: number;
  storeFor: (connectionId: string) => Promise<Store | "busy" | null>;
}): Promise<void> {
  const { now } = ctx;
  const tooLate = () => ctx.deadline - Date.now() < MONEY_PENDING_RESERVE_MS;
  if (tooLate()) return;
  const markedWhere = { moneyPendingSince: { not: null }, connection: { status: "active" } } satisfies Prisma.RefundWhereInput;
  // Each store with a marked refund, asked for once (storeFor's answer is the
  // run's, which the sweep reuses): a busy store's are left out of the take
  const busy: string[] = [];
  for (const { connectionId } of await prisma.refund.groupBy({ by: ["connectionId"], where: markedWhere })) {
    if ((await ctx.storeFor(connectionId)) === "busy") busy.push(connectionId);
  }
  const marked = await prisma.refund.findMany({
    where: { ...markedWhere, connectionId: { notIn: busy } },
    orderBy: [{ moneyCheckedAt: { sort: "asc", nulls: "first" } }, { refundedAt: "asc" }, { id: "asc" }],
    take: MAX_MONEY_PENDING_READS,
    select: {
      id: true,
      connectionId: true,
      externalRefundId: true,
      moneyPendingSince: true,
      order: { select: { externalOrderId: true, name: true } },
      connection: { select: { externalAccountId: true } },
    },
  });
  const conns = new Map<string, ConnectionContext | null>();
  const moved = new Set<string>();
  for (const row of marked) {
    // The sweep and the import polls keep their turn: the rest wait unstamped
    if (tooLate()) break;
    const { order } = row;
    const shop = row.connection.externalAccountId;
    const what = `refund ${row.externalRefundId} of order ${order.externalOrderId} for ${shop}`;
    const store = await ctx.storeFor(row.connectionId);
    // Left out above; the check narrows the type
    if (store === "busy") continue;
    let conn: ConnectionContext | null | undefined;
    try {
      await prisma.refund.updateMany({ where: { id: row.id, moneyPendingSince: { not: null } }, data: { moneyCheckedAt: now } });
      // Unreachable: counted once by storeFor
      if (!store) continue;
      if (!conns.has(row.connectionId)) conns.set(row.connectionId, await findConnection(shop));
      conn = conns.get(row.connectionId);
    } catch (error) {
      // One refund's database error is a problem, never the end of the run (RP25-F2)
      console.error(`[payout-check] Could not prepare the read of ${what}: ${messageOf(error)}`);
      ctx.problem(error);
      continue;
    }
    // Uninstalled since the run began
    if (!conn) continue;
    const expired = row.moneyPendingSince !== null && now.getTime() - row.moneyPendingSince.getTime() >= MONEY_PENDING_FOR_MS;

    let read: RefundFacts | null = null;
    // Whether its money may still be on its way: the read says so, or failed
    let stillMoving: boolean;
    try {
      const found = await store.orders.readRefund(row.externalRefundId, { deadline: ctx.deadline });
      // Gone from Shopify, or now another order's: settled from what is stored
      read = found && found.orderGid === order.externalOrderId ? found.refund : null;
      stillMoving = read?.moneyPending === true;
    } catch (error) {
      // The run's deadline cut the read off: the rest wait for the next run
      if (ctx.outOfTime()) break;
      const limit = isReadLimit(error);
      // Past what one read takes (20 or more refunds): logged, never a problem (M2c-F7)
      if (limit) console.warn(`[payout-check] The read of ${what} is past what one read takes: ${messageOf(error)}`);
      else console.error(`[payout-check] Could not read ${what}: ${messageOf(error)}`);
      if (!expired) {
        if (!limit) ctx.problem(error);
        continue;
      }
      // Past its 30 days: settled from what is stored, and counted once below
      stillMoving = true;
    }
    try {
      const settled = await settleRefundMoney(conn, row.id, read, { now, expired });
      if (settled.status === "settled") {
        ctx.result.refundsSettled++;
        moved.add(settled.customerId);
        if (expired && stillMoving) {
          // One problem, naming the order by its Shopify name for the merchant, never the buyer
          const late = new Error(
            `The money of refund ${row.externalRefundId} of order ${order.name} for ${shop} was still on its way after 30 days: only what succeeded was taken back`,
          );
          console.error(`[payout-check] ${late.message}`);
          ctx.problem(late);
        }
      } else if (settled.status === "still_pending" && settled.spendChanged) moved.add(settled.customerId);
    } catch (error) {
      // Its order's credit is being sent right now: the next run takes it
      if (error instanceof RefundRetryLater) continue;
      console.error(`[payout-check] Could not settle refund ${row.externalRefundId} of order ${order.externalOrderId} for ${shop}: ${messageOf(error)}`);
      ctx.problem(error);
    }
  }
  for (const customerId of moved) {
    try {
      await resolveTier(customerId);
    } catch (error) {
      console.error(`[payout-check] Could not resolve the tier of customer ${customerId}: ${messageOf(error)}`);
      ctx.problem(error);
    }
  }
}

/** What the sweep's steps share with their run (M2c-F8). */
interface SweepContext {
  result: PayoutCheckResult;
  problem: (error: unknown) => void;
  outOfTime: () => boolean;
  /** The run's time, which the listing looks back from. */
  now: Date;
  /** The run's deadline, as a Date.now() time, which every read ends by. */
  deadline: number;
  tallySend: (payoutId: string, outcome: SendOutcome) => Promise<void>;
}

/** An order past a known limit of the order source's reads (more refunds than one read takes): logged, never a problem (M2c-F7). */
function readLimitReached(orderGid: string, shop: string, error: Error): void {
  console.warn(`[payout-check] Order ${orderGid} for ${shop} is past what one read takes; the sweep leaves it: ${messageOf(error)}`);
}

/**
 * One store's sweep. True when it finished (its listing failing counts as
 * finished: the failure is a problem, and the store takes its turn again
 * after the others); false when the deadline cut it short, its listing
 * included (M2c-F3).
 */
async function sweepStore(
  ctx: SweepContext,
  connection: { id: string; externalAccountId: string; installedAt: Date; importHorizonDays: number },
  store: Store,
): Promise<boolean> {
  const shop = connection.externalAccountId;
  const since = new Date(Math.max(ctx.now.getTime() - SWEEP_DAYS * DAY_MS, connection.installedAt.getTime()));
  // The import reads no order created before this; nor does the sweep, unless a webhook recorded it
  const horizon = connection.installedAt.getTime() - connection.importHorizonDays * DAY_MS;
  let candidates: UpdatedOrder[];
  let recorded: Map<string, RecordedOrder>;
  try {
    const listed = await store.orders.recentlyUpdatedOrders(since, { deadline: ctx.deadline });
    candidates = listed.filter((order) => order.hasCustomer && !order.test);
    const rows = await prisma.order.findMany({
      where: { connectionId: connection.id, externalOrderId: { in: candidates.map((order) => order.orderGid) } },
      select: { externalOrderId: true, cancelledAt: true, refunds: { select: { externalRefundId: true } } },
    });
    recorded = new Map(rows.map((row) => [row.externalOrderId, row]));
  } catch (error) {
    // The run's deadline cut the listing off: the store was not swept, and keeps its turn
    if (ctx.outOfTime()) {
      console.warn(`[payout-check] The deadline cut off ${shop}'s listing: ${messageOf(error)}`);
      return false;
    }
    console.error(`[payout-check] Could not list ${shop}'s recently updated orders: ${messageOf(error)}`);
    ctx.problem(error);
    return true;
  }
  let conn: ConnectionContext | null = null;
  for (const order of candidates) {
    const row = recorded.get(order.orderGid);
    // An order from before the import's horizon, listed because it changed since (a fulfilment, a retag)
    if (!row && order.orderedAt.getTime() < horizon) continue;
    // Nothing to do for an order recorded with every refund and its cancellation
    if (row && !missingRefunds(order, row) && !(order.cancelledAt && !row.cancelledAt)) continue;
    if (ctx.outOfTime()) return false;
    conn ??= await findConnection(shop);
    // Uninstalled since the run began
    if (!conn) return true;
    try {
      if (!row) await sweepMissedOrder(ctx, conn, store, order.orderGid);
      else if (!(await sweepRecordedOrder(ctx, conn, store, order, row))) return false;
    } catch (error) {
      if (isReadLimit(error)) {
        readLimitReached(order.orderGid, shop, error);
        continue;
      }
      // One order Shopify's answer can't be read for (OrderReadError) or
      // that fails to record never stops the sweep. Only its id is logged.
      console.error(`[payout-check] Could not finish missed order ${order.orderGid} for ${shop}: ${messageOf(error)}`);
      ctx.problem(error);
    }
  }
  return true;
}

/** Whether the order may have refunds with no row (a listing cut short says it may). */
function missingRefunds(order: UpdatedOrder, row: RecordedOrder): boolean {
  if (order.refunds === null) return true;
  const known = new Set(row.refunds.map((refund) => refund.externalRefundId));
  return order.refunds.some((refund) => !known.has(refund.refundGid));
}

/** An order no webhook recorded: read, record, send, resolve the tier, as orders/paid does. */
async function sweepMissedOrder(ctx: SweepContext, conn: ConnectionContext, store: Store, orderGid: string): Promise<void> {
  const facts = await store.orders.readOrder(orderGid, { deadline: ctx.deadline });
  // Gone from Shopify since it was listed
  if (!facts) return;
  const recorded = await recordOrder(conn, facts, "live");
  if (recorded.status !== "recorded") return;
  ctx.result.swept++;
  if (recorded.payoutId) await ctx.tallySend(recorded.payoutId, await sendPayout(recorded.payoutId, store.rail, new Date()));
  await resolveTier(recorded.customerId);
}

/**
 * A recorded order's refunds with no row, each read and recorded as
 * refunds/create would (its take-back waits for a later run's step 2;
 * recordRefund decides what an imported order's refund adds, Ruling 54),
 * and a cancellation the row lacks; then the buyer's tier, whose spend
 * moved. Each refund is caught on its own: one that fails is logged by the
 * order's and its own id and is a problem, and the sweep goes on to the next
 * and the cancellation (M2c-F6). False when the deadline left refunds for
 * the next run.
 */
async function sweepRecordedOrder(
  ctx: SweepContext,
  conn: ConnectionContext,
  store: Store,
  order: UpdatedOrder,
  row: RecordedOrder,
): Promise<boolean> {
  const { shop } = conn;
  let customerId: string | null = null;
  let cut = false;
  let refunds = order.refunds;
  if (refunds === null) {
    // The listing may have cut them short: the order's own read has them all (or throws)
    try {
      const facts = await store.orders.readOrder(order.orderGid, { deadline: ctx.deadline });
      refunds = (facts?.refunds ?? []).map((refund) => ({ refundGid: refund.externalRefundId, refundedAt: refund.refundedAt }));
    } catch (error) {
      // Its refunds can't be had this run; its cancellation still can
      refunds = [];
      // The run's deadline cut the read off: the order keeps its turn (M2d-F1)
      if (ctx.outOfTime()) cut = true;
      else if (isReadLimit(error)) readLimitReached(order.orderGid, shop, error);
      else {
        console.error(`[payout-check] Could not read the refunds of order ${order.orderGid} for ${shop}: ${messageOf(error)}`);
        ctx.problem(error);
      }
    }
  }
  const known = new Set(row.refunds.map((refund) => refund.externalRefundId));
  for (const { refundGid } of refunds) {
    if (known.has(refundGid)) continue;
    if (ctx.outOfTime()) {
      cut = true;
      break;
    }
    try {
      const read = await store.orders.readRefund(refundGid, { deadline: ctx.deadline });
      if (!read || read.orderGid !== order.orderGid) continue;
      const recorded = await recordRefund(conn, order.orderGid, read.refund);
      if (recorded.status !== "recorded") continue;
      ctx.result.refundsSwept++;
      customerId = recorded.customerId;
    } catch (error) {
      // The run's deadline cut the read off: the rest wait for the next run (M2d-F1)
      if (ctx.outOfTime()) {
        cut = true;
        break;
      }
      // Its order's credit is being sent right now: the next run takes it
      if (error instanceof RefundRetryLater) continue;
      // The refund's read values it against the order's other refunds, so it meets the same limit
      if (isReadLimit(error)) {
        readLimitReached(order.orderGid, shop, error);
        continue;
      }
      console.error(`[payout-check] Could not record refund ${refundGid} of order ${order.orderGid} for ${shop}: ${messageOf(error)}`);
      ctx.problem(error);
    }
  }
  if (order.cancelledAt && !row.cancelledAt) {
    const cancelled = await recordCancellation(conn, order.orderGid, order.cancelledAt);
    if (cancelled) {
      ctx.result.cancelledSwept++;
      customerId = cancelled.customerId;
    }
  }
  if (customerId) await resolveTier(customerId);
  return !cut;
}
