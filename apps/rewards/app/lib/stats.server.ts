/**
 * The numbers the admin pages show, read from the ledger and the orders
 * (spec 4.1: every number on screen comes from the ledger or from Shopify).
 *
 * Home (spec 4.3), "this month" in the merchant's time zone:
 * - Cashback given: every ledger entry's shop-currency amount, so cashback
 *   net of take-backs and adjustments (a payout closed without sending, and
 *   the shortfall a take-back couldn't take, Ruling 35), by when it was
 *   written.
 * - Store credit spent at checkout: the orders paid this month, measured on
 *   the order (`shop_store_credit_used`, credit from any source). Test and
 *   cancelled orders count nowhere (plan Decision 7).
 * - Came back: buyers with an order paid this month who had an earlier
 *   order (by created date) that earned cashback.
 * Postgres does the time-zone arithmetic (`AT TIME ZONE` with the shop's
 * IANA zone), so a month or day starts at the shop's local midnight.
 *
 * Customers (spec 4.4): each buyer's spend is the tier engine's own
 * (spendCounted, the figure that decides the tier) and their cashback given
 * is the same ledger net as Home's, per buyer.
 */
import { Prisma, type LedgerEntryKind, type LookReason, type NoCashbackReason, type PayoutDirection, type PayoutState } from "@prisma/client";
import type { Decimal } from "decimal.js";
import prisma, { databaseSchema } from "~/db.server";
import { daysEnding, reviewDue, rewardStatus } from "./home-rules";
import type { ConnectionContext } from "./merchant.server";
import { Money, fromDb } from "./money";
import { type Progress, type TierRow, progress, spendCounted, spendOf, tierSpend, tierTable } from "./tiers.server";

export type RecentReward = {
  orderId: string;
  orderName: string;
  /** The buyer's Shopify customer id, for their live name; "" once redacted */
  customerId: string;
  tierName: string | null;
  /** Signed, in `currency` (the buyer's): a take-back is negative */
  amount: Decimal;
  currency: string;
  status: string;
};

export interface HomeStats {
  cashbackGiven: Decimal;
  creditSpent: Decimal;
  cameBack: number;
  /** The last 30 days in the shop's time zone, oldest first, in the shop's currency */
  daily: { date: string; given: Decimal; spent: Decimal }[];
  recent: RecentReward[];
  /** Lowest first */
  tiers: { id: string; name: string; percent: Decimal; members: number }[];
  needsLook: number;
  /** Cashback entries ever written (the review request counts them) */
  cashbackOrders: number;
}

/** How many ledger events Recent rewards shows. */
const RECENT = 5;
const DAYS = 30;

const table = (name: string) => Prisma.raw(`"${databaseSchema}"."${name}"`);

/**
 * Home's numbers for one store at `now`. Reads only; amounts stay exact
 * (sums come back from Postgres as text).
 */
export async function homeStats(conn: ConnectionContext, now: Date): Promise<HomeStats> {
  const { merchantId, timezone } = conn;
  const at = now.toISOString();
  // Local midnights as instants, and today's local date
  const [bounds] = await prisma.$queryRaw<Array<{ month_start: Date; days_start: Date; today: string }>>`
    SELECT
      date_trunc('month', ${at}::timestamptz AT TIME ZONE ${timezone}) AT TIME ZONE ${timezone} AS month_start,
      (date_trunc('day', ${at}::timestamptz AT TIME ZONE ${timezone}) - ${DAYS - 1}::int * interval '1 day') AT TIME ZONE ${timezone} AS days_start,
      to_char(${at}::timestamptz AT TIME ZONE ${timezone}, 'YYYY-MM-DD') AS today`;
  const monthStart = new Date(bounds.month_start);
  const daysStart = new Date(bounds.days_start);
  const inMonth = { gte: monthStart, lte: now };
  const countedOrder = { merchantId, test: false, cancelledAt: null };

  const [given, spent, cameBack, dailyGiven, dailySpent, recent, tiers, needsLook, cashbackOrders] = await Promise.all([
    prisma.ledgerEntry.aggregate({ _sum: { shopAmount: true }, where: { merchantId, createdAt: inMonth } }),
    prisma.order.aggregate({ _sum: { shopStoreCreditUsed: true }, where: { ...countedOrder, paidAt: inMonth } }),
    prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(DISTINCT o.customer_id)::int AS n
      FROM ${table("orders")} o
      WHERE o.merchant_id = ${merchantId}::uuid AND o.test = false AND o.cancelled_at IS NULL
        AND o.paid_at >= ${monthStart.toISOString()}::timestamptz AT TIME ZONE 'UTC'
        AND o.paid_at <= ${at}::timestamptz AT TIME ZONE 'UTC'
        AND EXISTS (
          SELECT 1 FROM ${table("ledger_entry")} e
          JOIN ${table("orders")} earlier ON earlier.id = e.order_id
          WHERE e.merchant_id = ${merchantId}::uuid AND e.kind = 'cashback'
            AND earlier.customer_id = o.customer_id AND earlier.ordered_at < o.ordered_at
        )`,
    prisma.$queryRaw<Array<{ day: string; total: string }>>`
      SELECT to_char(created_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}, 'YYYY-MM-DD') AS day, sum(shop_amount)::text AS total
      FROM ${table("ledger_entry")}
      WHERE merchant_id = ${merchantId}::uuid
        AND created_at >= ${daysStart.toISOString()}::timestamptz AT TIME ZONE 'UTC'
        AND created_at <= ${at}::timestamptz AT TIME ZONE 'UTC'
      GROUP BY 1`,
    prisma.$queryRaw<Array<{ day: string; total: string }>>`
      SELECT to_char(paid_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}, 'YYYY-MM-DD') AS day, sum(shop_store_credit_used)::text AS total
      FROM ${table("orders")}
      WHERE merchant_id = ${merchantId}::uuid AND test = false AND cancelled_at IS NULL
        AND paid_at >= ${daysStart.toISOString()}::timestamptz AT TIME ZONE 'UTC'
        AND paid_at <= ${at}::timestamptz AT TIME ZONE 'UTC'
      GROUP BY 1`,
    prisma.ledgerEntry.findMany({
      where: { merchantId, kind: { in: ["cashback", "reversal"] }, createdAt: { lte: now } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: RECENT,
      select: {
        kind: true,
        amount: true,
        currency: true,
        tierName: true,
        order: { select: { id: true, name: true } },
        customer: { select: { externalCustomerId: true } },
        payout: { select: { state: true } },
      },
    }),
    prisma.tier.findMany({
      where: { merchantId },
      orderBy: [{ minSpend: "asc" }, { position: "asc" }, { id: "asc" }],
      select: { id: true, name: true, cashbackPercent: true, _count: { select: { members: true } } },
    }),
    prisma.payout.count({ where: { merchantId, state: "needs_look" } }),
    prisma.ledgerEntry.count({ where: { merchantId, kind: "cashback" } }),
  ]);

  const byDay = (rows: Array<{ day: string; total: string }>) => new Map(rows.map((row) => [row.day, new Money(row.total)]));
  const givenByDay = byDay(dailyGiven);
  const spentByDay = byDay(dailySpent);

  return {
    cashbackGiven: fromDb(given._sum.shopAmount ?? 0),
    creditSpent: fromDb(spent._sum.shopStoreCreditUsed ?? 0),
    cameBack: cameBack[0]?.n ?? 0,
    daily: daysEnding(bounds.today, DAYS).map((date) => ({
      date,
      given: givenByDay.get(date) ?? new Money(0),
      spent: spentByDay.get(date) ?? new Money(0),
    })),
    recent: recent
      .filter((entry) => entry.order !== null)
      .map((entry) => ({
        orderId: entry.order!.id,
        orderName: entry.order!.name,
        customerId: entry.customer.externalCustomerId ?? "",
        tierName: entry.tierName,
        amount: fromDb(entry.amount),
        currency: entry.currency,
        // A cashback or take-back entry is written with its payout, in one transaction
        status: rewardStatus(entry.kind as "cashback" | "reversal", entry.payout?.state ?? "pending"),
      })),
    tiers: tiers.map((tier) => ({ id: tier.id, name: tier.name, percent: fromDb(tier.cashbackPercent), members: tier._count.members })),
    needsLook,
    cashbackOrders,
  };
}

/** Home's setup and request facts for one store at `now`. */
export interface HomeState {
  /** The soonest due date of an open customer data request */
  privacyDueAt: Date | null;
  importState: "not_started" | "running" | "done" | "failed";
  importError: string | null;
  /** The merchant dismissed the import's outcome on Home */
  importDismissed: boolean;
  /** How far back the import reads: 365, or 60 without read_all_orders */
  importHorizonDays: number;
  /** Buyers the past-orders import brought in who now hold a tier */
  placedBuyers: number;
  reviewDue: boolean;
}

/** `cashbackEntries` is HomeStats.cashbackOrders, read once for both. */
export async function homeState(conn: ConnectionContext, now: Date, cashbackEntries: number): Promise<HomeState> {
  const [merchant, connection, privacy, placedBuyers] = await Promise.all([
    prisma.merchant.findUniqueOrThrow({
      where: { id: conn.merchantId },
      select: { createdAt: true, reviewPromptDismissedAt: true, reviewPromptShownAt: true },
    }),
    prisma.connection.findUniqueOrThrow({
      where: { id: conn.connectionId },
      select: { importState: true, importError: true, importHorizonDays: true, importDismissedAt: true },
    }),
    prisma.privacyRequest.findFirst({
      where: { connectionId: conn.connectionId, status: "open" },
      orderBy: { dueAt: "asc" },
      select: { dueAt: true },
    }),
    prisma.customer.count({
      where: { connectionId: conn.connectionId, tierId: { not: null }, orders: { some: { source: "import" } } },
    }),
  ]);
  return {
    privacyDueAt: privacy?.dueAt ?? null,
    importState: connection.importState,
    importError: connection.importError,
    importDismissed: connection.importDismissedAt !== null,
    importHorizonDays: connection.importHorizonDays,
    placedBuyers,
    reviewDue: reviewDue({
      cashbackEntries,
      merchantCreatedAt: merchant.createdAt,
      dismissedAt: merchant.reviewPromptDismissedAt,
      shownAt: merchant.reviewPromptShownAt,
      now,
    }),
  };
}

/** Buyers a Customers page shows. */
export const CUSTOMER_PAGE_SIZE = 50;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CustomerRow = {
  id: string;
  /** The buyer's Shopify customer id, for their live name */
  externalCustomerId: string;
  tierId: string | null;
  tierName: string | null;
  /** Their orders RewardsPro recorded, test orders aside (they count nowhere, Decision 7) */
  orders: number;
  /** Tier spend over the merchant's window, in the shop's currency: tierSpend's figure */
  spend: Decimal;
  /** Every ledger entry's shop-currency amount: cashback net of take-backs and adjustments, as on Home */
  cashbackGiven: Decimal;
};

/**
 * One page of the Customers list (spec 4.4): the store's buyers, newest
 * first (by when RewardsPro first saw them, then id), CUSTOMER_PAGE_SIZE to a
 * page counted from 1. Erased buyers (customers/redact) are not listed: there
 * is no one left to show. `tierId` keeps the buyers who hold that tier (one
 * that is not the merchant's keeps no one); `externalIds` keeps the buyers
 * with those Shopify ids (a search's matches; an empty list keeps no one).
 * The page's buyers are read first and their numbers for them alone, so a
 * page costs the same however large the store. `now` is for the spend window.
 */
export async function customerRows(
  conn: ConnectionContext,
  o: { tierId?: string; externalIds?: string[]; page: number; now?: Date },
): Promise<{ rows: CustomerRow[]; hasNext: boolean }> {
  const none = { rows: [], hasNext: false };
  if (o.tierId !== undefined && !UUID.test(o.tierId)) return none;
  if (o.externalIds !== undefined && o.externalIds.length === 0) return none;
  const page = Number.isSafeInteger(o.page) && o.page >= 1 ? o.page : 1;

  const buyers = await prisma.customer.findMany({
    where: {
      merchantId: conn.merchantId,
      connectionId: conn.connectionId,
      externalCustomerId: o.externalIds ? { in: o.externalIds } : { not: null },
      ...(o.tierId ? { tierId: o.tierId } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * CUSTOMER_PAGE_SIZE,
    take: CUSTOMER_PAGE_SIZE + 1,
    select: { id: true, externalCustomerId: true, tierId: true, tier: { select: { name: true } } },
  });
  const shown = buyers.slice(0, CUSTOMER_PAGE_SIZE);
  const ids = shown.map((buyer) => buyer.id);
  if (ids.length === 0) return none;

  const [orders, spends, given] = await Promise.all([
    prisma.order.groupBy({ by: ["customerId"], where: { merchantId: conn.merchantId, customerId: { in: ids }, test: false }, _count: { _all: true } }),
    prisma.order.groupBy({
      by: ["customerId"],
      where: { merchantId: conn.merchantId, customerId: { in: ids }, ...spendCounted(conn.tierWindow, o.now ?? new Date()) },
      _sum: { shopProductAmount: true, shopRefundedProductAmount: true },
    }),
    prisma.ledgerEntry.groupBy({ by: ["customerId"], where: { merchantId: conn.merchantId, customerId: { in: ids } }, _sum: { shopAmount: true } }),
  ]);
  const ordersOf = new Map(orders.map((row) => [row.customerId, row._count._all]));
  const spendOfBuyer = new Map(spends.map((row) => [row.customerId, spendOf(row._sum)]));
  const givenOf = new Map(given.map((row) => [row.customerId, fromDb(row._sum.shopAmount ?? 0)]));

  return {
    rows: shown.map((buyer) => ({
      id: buyer.id,
      externalCustomerId: buyer.externalCustomerId!,
      tierId: buyer.tierId,
      tierName: buyer.tier?.name ?? null,
      orders: ordersOf.get(buyer.id) ?? 0,
      spend: spendOfBuyer.get(buyer.id) ?? new Money(0),
      cashbackGiven: givenOf.get(buyer.id) ?? new Money(0),
    })),
    hasNext: buyers.length > CUSTOMER_PAGE_SIZE,
  };
}

/** How many ledger entries and orders the buyer panel lists, newest first. */
export const PANEL_LIMIT = 50;

/** One ledger entry of a buyer, with its payout (a cashback or take-back has one; an adjustment none). */
export type HistoryEntry = {
  kind: LedgerEntryKind;
  /** Signed, in `currency` (the buyer's) */
  amount: Decimal;
  currency: string;
  /** The tier and rate it earned at */
  tierName: string | null;
  ratePercent: Decimal | null;
  /** `cashback:…`, `reversal:…`, `shortfall:<payout id>`, `close:<payout id>` */
  idempotencyKey: string;
  createdAt: Date;
  orderId: string | null;
  orderName: string | null;
  payout: {
    direction: PayoutDirection;
    state: PayoutState;
    lookReason: LookReason | null;
    /** Positive, what it is to move */
    amount: Decimal;
    /** A take-back's actual take, when Shopify said (null: unknown, A11-F4) */
    debitedAmount: Decimal | null;
    unconfirmedAt: Date | null;
    lastError: string | null;
  } | null;
};

export type BuyerOrder = {
  id: string;
  name: string;
  source: "live" | "import";
  test: boolean;
  cancelledAt: Date | null;
  noCashbackReason: NoCashbackReason | null;
  currency: string;
  totalAmount: Decimal;
  /** The order's processedAt (Ruling 27) */
  paidAt: Date;
  /** Its cashback entry, in the buyer's currency */
  cashback: { amount: Decimal; currency: string } | null;
};

export interface BuyerPanel {
  id: string;
  externalCustomerId: string;
  tierId: string | null;
  tierSince: Date | null;
  lockedTierId: string | null;
  /** The merchant's tiers, lowest first */
  tiers: TierRow[];
  /** Tier spend over the merchant's window, the figure that decides the tier */
  spend: Decimal;
  progress: Progress;
  history: HistoryEntry[];
  /** The buyer has older entries than `history` holds */
  moreHistory: boolean;
  orders: BuyerOrder[];
  moreOrders: boolean;
}

/**
 * The buyer panel's facts (spec 4.4) for one of the store's buyers: tier and
 * since when, progress from the same spend that decides the tier, the newest
 * PANEL_LIMIT ledger entries (each with the tier and rate it earned at) and
 * orders. Null when the buyer is not the store's, was erased, or `customerId`
 * is no id at all.
 */
export async function buyerPanel(conn: ConnectionContext, customerId: string, now: Date): Promise<BuyerPanel | null> {
  if (!UUID.test(customerId)) return null;
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, merchantId: conn.merchantId, connectionId: conn.connectionId, externalCustomerId: { not: null } },
    select: { id: true, externalCustomerId: true, tierId: true, tierSince: true, lockedTierId: true },
  });
  if (!customer) return null;

  const [tiers, spend, entries, orders] = await Promise.all([
    tierTable(conn.merchantId),
    tierSpend(customer.id, conn.tierWindow, now),
    prisma.ledgerEntry.findMany({
      where: { merchantId: conn.merchantId, customerId: customer.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PANEL_LIMIT + 1,
      select: {
        kind: true,
        amount: true,
        currency: true,
        tierName: true,
        ratePercent: true,
        idempotencyKey: true,
        createdAt: true,
        order: { select: { id: true, name: true } },
        payout: { select: { direction: true, state: true, lookReason: true, amount: true, debitedAmount: true, unconfirmedAt: true, lastError: true } },
      },
    }),
    prisma.order.findMany({
      where: { merchantId: conn.merchantId, customerId: customer.id },
      orderBy: [{ orderedAt: "desc" }, { id: "desc" }],
      take: PANEL_LIMIT + 1,
      select: {
        id: true,
        name: true,
        source: true,
        test: true,
        cancelledAt: true,
        noCashbackReason: true,
        currency: true,
        totalAmount: true,
        paidAt: true,
        ledgerEntries: { where: { kind: "cashback" }, select: { amount: true, currency: true }, take: 1 },
      },
    }),
  ]);
  const tierRows: TierRow[] = tiers.map(({ id, name, minSpend, cashbackPercent, position }) => ({ id, name, minSpend, cashbackPercent, position }));

  return {
    id: customer.id,
    externalCustomerId: customer.externalCustomerId!,
    tierId: customer.tierId,
    tierSince: customer.tierSince,
    lockedTierId: customer.lockedTierId,
    tiers: tierRows,
    spend,
    progress: progress(spend, customer.tierId ?? "", tierRows),
    moreHistory: entries.length > PANEL_LIMIT,
    moreOrders: orders.length > PANEL_LIMIT,
    history: entries.slice(0, PANEL_LIMIT).map((entry) => ({
      kind: entry.kind,
      amount: fromDb(entry.amount),
      currency: entry.currency,
      tierName: entry.tierName,
      ratePercent: entry.ratePercent === null ? null : fromDb(entry.ratePercent),
      idempotencyKey: entry.idempotencyKey,
      createdAt: entry.createdAt,
      orderId: entry.order?.id ?? null,
      orderName: entry.order?.name ?? null,
      payout: entry.payout
        ? {
            direction: entry.payout.direction,
            state: entry.payout.state,
            lookReason: entry.payout.lookReason,
            amount: fromDb(entry.payout.amount),
            debitedAmount: entry.payout.debitedAmount === null ? null : fromDb(entry.payout.debitedAmount),
            unconfirmedAt: entry.payout.unconfirmedAt,
            lastError: entry.payout.lastError,
          }
        : null,
    })),
    orders: orders.slice(0, PANEL_LIMIT).map((order) => {
      const [cashback] = order.ledgerEntries;
      return {
        id: order.id,
        name: order.name,
        source: order.source,
        test: order.test,
        cancelledAt: order.cancelledAt,
        noCashbackReason: order.noCashbackReason,
        currency: order.currency,
        totalAmount: fromDb(order.totalAmount),
        paidAt: order.paidAt,
        cashback: cashback ? { amount: fromDb(cashback.amount), currency: cashback.currency } : null,
      };
    }),
  };
}
