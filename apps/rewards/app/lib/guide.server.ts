/**
 * The first-time setup guide (RP-24): when a store is sent to it, "Finish
 * later", and the try-it list.
 *
 * The guide is due while the store has no tiers and the merchant has not
 * pressed "Finish later"; once either changes it stays away.
 *
 * The try-it list (spec 4.8) is the store's newest live orders since the
 * guide's switch turned cashback on, each with its status as the Orders page
 * words it (orderStatus over its cashback entry, that entry's credit and its
 * take-backs) and the cashback it earned.
 */
import type { LedgerEntryKind, LookReason, NoCashbackReason, PayoutState, Prisma } from "@prisma/client";
import prisma from "~/db.server";
import type { ConnectionContext } from "./merchant.server";
import { fromDb } from "./money";
import { type OrderStatus, orderStatus } from "./order-status";
import { monitoring } from "./telemetry.server";
import { UUID } from "./uuid";

/** Whether opening the app should send this store to the guide. */
export async function guideDue(merchantId: string): Promise<boolean> {
  if (!UUID.test(merchantId)) return false;
  const due = await prisma.merchant.count({ where: { id: merchantId, guideDismissedAt: null, tiers: { none: {} } } });
  return due === 1;
}

/** The merchant pressed "Finish later": the first time is kept. */
export async function dismissGuide(merchantId: string, now: Date = new Date()): Promise<void> {
  await prisma.merchant.updateMany({ where: { id: merchantId, guideDismissedAt: null }, data: { guideDismissedAt: now } });
}

/**
 * When the guide's switch turned cashback on, for the try-it list: the later
 * of the setup's completion and the newest tier's creation, while cashback is
 * on and setup is completed; else null. A store that completed setup on Home
 * long ago keeps its first setupCompletedAt (markSetupCompleted), so the
 * ladder the guide saved since stands in for its switch-on.
 * For a paused store with old tiers that switches on at step 3 this is an older time (R18); the try-it list is still the newest five live orders, from which the merchant picks theirs.
 */
export async function guideSwitchedOnAt(merchantId: string): Promise<Date | null> {
  if (!UUID.test(merchantId)) return null;
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { running: true, setupCompletedAt: true, tiers: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } },
  });
  if (!merchant?.running || !merchant.setupCompletedAt) return null;
  const newestTier = merchant.tiers[0]?.createdAt ?? null;
  return newestTier !== null && newestTier > merchant.setupCompletedAt ? newestTier : merchant.setupCompletedAt;
}

export interface TryItOrder {
  orderId: string;
  name: string;
  /** The buyer's Shopify customer id, for their page in Shopify; null once erased */
  externalCustomerId: string | null;
  status: OrderStatus;
  /** Its cashback entry, in the buyer's currency */
  cashback: { amount: string; currency: string } | null;
}

/** Orders the try-it list shows. */
const TRY_IT_LIMIT = 5;

/** How long before the switch-on an order still counts: one placed while the merchant pressed it. */
const TRY_IT_GRACE_MS = 15 * 60 * 1000;

/**
 * What orderStatus reads of an order's cashback entry and take-backs. A copy of
 * the Orders page's select (app/lib/stats.server.ts:612-667, STATUS_ENTRY_SELECT
 * through cashbackAndStatus), less the tier name and rate the try-it list
 * doesn't show: keep in step until the R7 follow-up moves both into app/lib.
 */
const STATUS_ENTRY_SELECT = {
  id: true,
  kind: true,
  amount: true,
  currency: true,
  payout: { select: { state: true, lookReason: true, debitedAmount: true } },
} as const;

type StatusEntry = {
  id: string;
  kind: LedgerEntryKind;
  amount: Prisma.Decimal;
  currency: string;
  payout: { state: PayoutState; lookReason: LookReason | null; debitedAmount: Prisma.Decimal | null } | null;
};

type StatusOrder = { source: "live" | "import"; test: boolean; noCashbackReason: NoCashbackReason | null; cashbackBase: Prisma.Decimal };

/** A cashback or take-back without its payout is a broken invariant: it reads Unknown, and is reported (M3a-F4). */
function reportMissingPayout(ledgerEntryId: string): void {
  const message = `A cashback or take-back ledger entry has no payout: ${ledgerEntryId}`;
  console.error(`[guide] ${message}`);
  monitoring.captureMessage(message, "error", { tags: { "ledger.invariant": "entry-without-payout" }, extra: { ledgerEntryId } });
}

/**
 * The order's cashback and status from its ledger entries, as the Orders page
 * works them out. Twin of cashbackAndStatus in app/lib/stats.server.ts:612-667
 * (the Orders page): keep in step until the R7 follow-up moves both into app/lib.
 */
function cashbackAndStatus(order: StatusOrder, entries: StatusEntry[]): Pick<TryItOrder, "cashback" | "status"> {
  const cashback = entries.find((entry) => entry.kind === "cashback") ?? null;
  for (const entry of entries) {
    if ((entry.kind === "cashback" || entry.kind === "reversal") && !entry.payout) reportMissingPayout(entry.id);
  }
  const reversals = entries.flatMap((entry) =>
    entry.kind === "reversal" && entry.payout
      ? [
          {
            amount: fromDb(entry.amount),
            state: entry.payout.state,
            lookReason: entry.payout.lookReason,
            debitedAmount: entry.payout.debitedAmount === null ? null : fromDb(entry.payout.debitedAmount),
          },
        ]
      : [],
  );
  return {
    cashback: cashback ? { amount: fromDb(cashback.amount).toFixed(), currency: cashback.currency } : null,
    status: orderStatus(
      { ...order, cashbackBase: fromDb(order.cashbackBase) },
      cashback ? { amount: fromDb(cashback.amount), currency: cashback.currency } : null,
      cashback?.payout ?? null,
      reversals,
    ),
  };
}

/**
 * The store's live orders placed since `since` (less 15 minutes, for an
 * order placed while the switch was being pressed), newest first by created
 * date then id, at most `limit`. Import orders never earn, so they are left
 * out.
 */
export async function tryItOrders(
  conn: Pick<ConnectionContext, "connectionId" | "merchantId">,
  since: Date,
  limit: number = TRY_IT_LIMIT,
): Promise<TryItOrder[]> {
  const orders = await prisma.order.findMany({
    where: {
      merchantId: conn.merchantId,
      connectionId: conn.connectionId,
      source: "live",
      orderedAt: { gte: new Date(since.getTime() - TRY_IT_GRACE_MS) },
    },
    orderBy: [{ orderedAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      name: true,
      source: true,
      test: true,
      noCashbackReason: true,
      cashbackBase: true,
      customer: { select: { externalCustomerId: true } },
      ledgerEntries: { where: { kind: { in: ["cashback", "reversal"] } }, select: STATUS_ENTRY_SELECT },
    },
  });
  return orders.map((order) => ({
    orderId: order.id,
    name: order.name,
    externalCustomerId: order.customer.externalCustomerId,
    ...cashbackAndStatus(order, order.ledgerEntries),
  }));
}
