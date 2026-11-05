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
 *
 * Orders (spec 4.6): each order's status is orderStatus (order-status.ts,
 * no database) over its cashback entry, that entry's credit and its
 * take-backs, each sent take-back counted at what it took (Ruling 65).
 *
 * Erased buyers (customers/redact keeps the row without its Shopify id) are
 * nobody's member and placed by no import (TRUTH-9).
 */
import { Prisma, type LedgerEntryKind, type LookReason, type NoCashbackReason, type PayoutDirection, type PayoutState } from "@prisma/client";
import type { Decimal } from "decimal.js";
import prisma, { databaseSchema } from "~/db.server";
import { daysEnding, reviewDue } from "./home-rules";
import type { ConnectionContext } from "./merchant.server";
import { Money, fromDb } from "./money";
import { type OrderStatus, orderStatus } from "./order-status";
import { payoutVersion } from "./payouts.server";
import { monitoring } from "./telemetry.server";
import { type Progress, type TierRow, progress, qualify, spendCounted, spendOf, tierSpend, tierTable } from "./tiers.server";
import { UUID } from "./uuid";

export type RecentReward = {
  orderId: string;
  orderName: string;
  /** The buyer's Shopify customer id, for their live name; "" once redacted */
  customerId: string;
  tierName: string | null;
  kind: "cashback" | "reversal";
  /** Signed, in `currency` (the buyer's): a take-back is negative */
  amount: Decimal;
  currency: string;
  /**
   * Its payout, which says what really moved (a take-back's debitedAmount,
   * Ruling 65). Null is a broken invariant, reported when read (A19-F8).
   */
  payout: { direction: PayoutDirection; state: PayoutState; amount: Decimal; debitedAmount: Decimal | null } | null;
};

export interface HomeStats {
  cashbackGiven: Decimal;
  creditSpent: Decimal;
  cameBack: number;
  /** The last 30 days in the shop's time zone, oldest first, in the shop's currency */
  daily: { date: string; given: Decimal; spent: Decimal }[];
  recent: RecentReward[];
  /** Lowest first; members are the buyers who hold each, erased ones aside */
  tiers: { id: string; name: string; percent: Decimal; members: number }[];
  /** Orders with a payout that needs a look, as the Orders page counts them (Ruling 56) */
  needsLook: number;
  /** Cashback entries ever written (the review request counts them) */
  cashbackOrders: number;
}

/** How many ledger events Recent rewards shows. */
const RECENT = 5;
const DAYS = 30;

const table = (name: string) => Prisma.raw(`"${databaseSchema}"."${name}"`);

/** A buyer who is still someone: customers/redact blanks the Shopify id (TRUTH-9). */
const NOT_ERASED = { externalCustomerId: { not: null } };

/** An order with a payout (its credit or a take-back) that needs a look. */
const NEEDS_LOOK_ORDER = { ledgerEntries: { some: { payout: { state: "needs_look" as const } } } };

/** The store's orders with a payout that needs a look: one count for Home's banner and the Orders page (Ruling 56). */
function needsLookOrders(conn: Pick<ConnectionContext, "merchantId" | "connectionId">): Promise<number> {
  return prisma.order.count({ where: { merchantId: conn.merchantId, connectionId: conn.connectionId, ...NEEDS_LOOK_ORDER } });
}

/** A cashback or take-back entry with no payout: every writer pairs the two, so say so, by the entry's id alone (A19-F8). */
function reportMissingPayout(ledgerEntryId: string): void {
  const message = `A cashback or take-back ledger entry has no payout: ${ledgerEntryId}`;
  console.error(`[stats] ${message}`);
  monitoring.captureMessage(message, "error", { tags: { "ledger.invariant": "entry-without-payout" }, extra: { ledgerEntryId } });
}

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
        id: true,
        kind: true,
        amount: true,
        currency: true,
        tierName: true,
        order: { select: { id: true, name: true } },
        customer: { select: { externalCustomerId: true } },
        payout: { select: { direction: true, state: true, amount: true, debitedAmount: true } },
      },
    }),
    prisma.tier.findMany({
      where: { merchantId },
      orderBy: [{ minSpend: "asc" }, { position: "asc" }, { id: "asc" }],
      select: { id: true, name: true, cashbackPercent: true, _count: { select: { members: { where: NOT_ERASED } } } },
    }),
    needsLookOrders(conn),
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
      .map((entry) => {
        // A cashback or take-back entry is written with its payout, in one transaction
        if (!entry.payout) reportMissingPayout(entry.id);
        return {
          orderId: entry.order!.id,
          orderName: entry.order!.name,
          customerId: entry.customer.externalCustomerId ?? "",
          tierName: entry.tierName,
          kind: entry.kind as "cashback" | "reversal",
          amount: fromDb(entry.amount),
          currency: entry.currency,
          payout: entry.payout
            ? {
                direction: entry.payout.direction,
                state: entry.payout.state,
                amount: fromDb(entry.payout.amount),
                debitedAmount: entry.payout.debitedAmount === null ? null : fromDb(entry.payout.debitedAmount),
              }
            : null,
        };
      }),
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
  /** Buyers the past-orders import brought in who now hold a tier, erased ones aside */
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
      where: { connectionId: conn.connectionId, ...NOT_ERASED, tierId: { not: null }, orders: { some: { source: "import" } } },
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

/** Where a Customers page ends: its last buyer, in the list's order. */
export type CustomerCursor = { createdAt: Date; id: string };

/**
 * One page of the Customers list (spec 4.4): the store's buyers, newest
 * first (by when RewardsPro first saw them, then id), CUSTOMER_PAGE_SIZE to a
 * page counted from 1. Erased buyers (customers/redact) are not listed: there
 * is no one left to show. `tierId` keeps the buyers who hold that tier (one
 * that is not the merchant's keeps no one); `externalIds` keeps the buyers
 * with those Shopify ids (a search's matches; an empty list keeps no one).
 * The page's buyers are read first and their numbers for them alone, so a
 * page costs the same however large the store. `now` is for the spend window.
 *
 * `after` reads the page after a buyer instead of page `page`: the buyers
 * after its (createdAt, id) in the same order, so a buyer leaving the filter
 * meanwhile moves no one else off the pages still to read (keyset pages,
 * CONCURRENCY-5). `next` is the cursor for the following page, when there is
 * one.
 */
export async function customerRows(
  conn: ConnectionContext,
  o: { tierId?: string; externalIds?: string[]; page: number; after?: CustomerCursor; now?: Date },
): Promise<{ rows: CustomerRow[]; hasNext: boolean; next?: CustomerCursor }> {
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
      ...(o.after ? { OR: [{ createdAt: { lt: o.after.createdAt } }, { createdAt: o.after.createdAt, id: { lt: o.after.id } }] } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: o.after ? 0 : (page - 1) * CUSTOMER_PAGE_SIZE,
    take: CUSTOMER_PAGE_SIZE + 1,
    select: { id: true, externalCustomerId: true, tierId: true, createdAt: true, tier: { select: { name: true } } },
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
    ...(buyers.length > CUSTOMER_PAGE_SIZE ? { next: { createdAt: shown.at(-1)!.createdAt, id: shown.at(-1)!.id } } : {}),
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
  /** As the Orders page says it (TRUTH-14) */
  status: OrderStatus;
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
  /**
   * The tier the buyer's spend already qualifies for when it is above the
   * one they hold (the tier pass hasn't reached them yet, TRUTH-11); null
   * otherwise, and always for a locked buyer, whom spend doesn't move.
   */
  movesTo: string | null;
  /** The currencies RewardsPro wrote the buyer's ledger entries in, for their live balance (Ruling 66) */
  currencies: string[];
  history: HistoryEntry[];
  /** The buyer has older entries than `history` holds */
  moreHistory: boolean;
  orders: BuyerOrder[];
  moreOrders: boolean;
}

/** Where a buyer is one of the store's and not erased: the buyer panel's, and its action's (A21-F5), one rule. */
const storeBuyer = (conn: ConnectionContext, customerId: string) => ({
  id: customerId,
  merchantId: conn.merchantId,
  connectionId: conn.connectionId,
  externalCustomerId: { not: null },
});

/**
 * The buyer's id when they are one of the store's and not erased, read
 * alone: what an action on the buyer panel checks before it acts (A21-F5),
 * without the panel's numbers. Null otherwise, and for no id at all.
 */
export async function ownBuyer(conn: ConnectionContext, customerId: string): Promise<{ id: string } | null> {
  if (!UUID.test(customerId)) return null;
  return prisma.customer.findFirst({ where: storeBuyer(conn, customerId), select: { id: true } });
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
    where: storeBuyer(conn, customerId),
    select: { id: true, externalCustomerId: true, tierId: true, tierSince: true, lockedTierId: true },
  });
  if (!customer) return null;

  const [tiers, spend, entries, orders, currencies] = await Promise.all([
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
        cashbackBase: true,
        paidAt: true,
        ledgerEntries: { where: { kind: { in: ["cashback", "reversal"] } }, select: STATUS_ENTRY_SELECT },
      },
    }),
    // GROUP BY in Postgres: one row per currency, however many entries
    prisma.ledgerEntry.groupBy({ by: ["currency"], where: { merchantId: conn.merchantId, customerId: customer.id } }),
  ]);
  const tierRows: TierRow[] = tiers.map(({ id, name, minSpend, cashbackPercent, position }) => ({ id, name, minSpend, cashbackPercent, position }));
  // The held tier, or the lowest for a buyer with none (rule 2), against the one their spend qualifies for
  const held = tierRows.find((t) => t.id === customer.tierId) ?? tierRows[0] ?? null;
  const qualified = held && customer.lockedTierId === null ? qualify(spend, tierRows) : null;

  return {
    id: customer.id,
    externalCustomerId: customer.externalCustomerId!,
    tierId: customer.tierId,
    tierSince: customer.tierSince,
    lockedTierId: customer.lockedTierId,
    tiers: tierRows,
    spend,
    progress: progress(spend, customer.tierId ?? "", tierRows),
    movesTo: held && qualified && qualified.minSpend.gt(held.minSpend) ? qualified.name : null,
    currencies: currencies.map((row) => row.currency).sort(),
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
      const { cashback, status } = cashbackAndStatus(order, order.ledgerEntries);
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
        cashback: cashback ? { amount: cashback.amount, currency: cashback.currency } : null,
        status,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Orders (spec 4.6)
// ---------------------------------------------------------------------------

// The pure rule, here with the rest of the admin's numbers
export { orderStatus };
export type { OrderStatus };

/** Orders an Orders page shows. */
export const ORDER_PAGE_SIZE = 50;

/** What orderStatus reads of an order's cashback entry and take-backs. */
const STATUS_ENTRY_SELECT = {
  kind: true,
  amount: true,
  currency: true,
  tierName: true,
  ratePercent: true,
  payout: { select: { state: true, lookReason: true, debitedAmount: true } },
} as const;

type StatusEntry = {
  kind: LedgerEntryKind;
  amount: Prisma.Decimal;
  currency: string;
  tierName: string | null;
  ratePercent: Prisma.Decimal | null;
  payout: { state: PayoutState; lookReason: LookReason | null; debitedAmount: Prisma.Decimal | null } | null;
};

type StatusOrder = { source: "live" | "import"; test: boolean; noCashbackReason: NoCashbackReason | null; cashbackBase: Prisma.Decimal };

/** The order's cashback (amount, tier and rate) and status, from its ledger entries. */
function cashbackAndStatus(order: StatusOrder, entries: StatusEntry[]) {
  const cashback = entries.find((entry) => entry.kind === "cashback") ?? null;
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
    cashback: cashback
      ? {
          amount: fromDb(cashback.amount),
          currency: cashback.currency,
          tierName: cashback.tierName,
          ratePercent: cashback.ratePercent === null ? null : fromDb(cashback.ratePercent),
        }
      : null,
    status: orderStatus(
      { ...order, cashbackBase: fromDb(order.cashbackBase) },
      cashback ? { amount: fromDb(cashback.amount), currency: cashback.currency } : null,
      cashback?.payout ?? null,
      reversals,
    ),
  };
}

export type OrderRow = {
  id: string;
  name: string;
  currency: string;
  totalAmount: Decimal;
  /** The buyer's customer row, for their panel; null once erased */
  customerId: string | null;
  /** The buyer's Shopify customer id, for their live name; null once erased */
  externalCustomerId: string | null;
  /** Its cashback entry, in the buyer's currency, with the tier and rate it earned at */
  cashback: { amount: Decimal; currency: string; tierName: string | null; ratePercent: Decimal | null } | null;
  status: OrderStatus;
};

/**
 * One page of the Orders list (spec 4.6): the store's orders, newest first
 * (by created date, then id), ORDER_PAGE_SIZE to a page counted from 1;
 * `needsLook` keeps only the orders with a payout that needs a look.
 * `needsLook` in the answer counts those orders, whichever page is asked for.
 */
export async function orderRows(
  conn: ConnectionContext,
  o: { page: number; needsLook?: boolean },
): Promise<{ rows: OrderRow[]; hasNext: boolean; needsLook: number }> {
  const page = Number.isSafeInteger(o.page) && o.page >= 1 ? o.page : 1;
  const ours = { merchantId: conn.merchantId, connectionId: conn.connectionId };
  const [orders, needsLook] = await Promise.all([
    prisma.order.findMany({
      where: { ...ours, ...(o.needsLook ? NEEDS_LOOK_ORDER : {}) },
      orderBy: [{ orderedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * ORDER_PAGE_SIZE,
      take: ORDER_PAGE_SIZE + 1,
      select: {
        id: true,
        name: true,
        source: true,
        test: true,
        noCashbackReason: true,
        currency: true,
        totalAmount: true,
        cashbackBase: true,
        customer: { select: { id: true, externalCustomerId: true } },
        ledgerEntries: { where: { kind: { in: ["cashback", "reversal"] } }, select: STATUS_ENTRY_SELECT },
      },
    }),
    needsLookOrders(conn),
  ]);

  return {
    rows: orders.slice(0, ORDER_PAGE_SIZE).map((order) => {
      const erased = order.customer.externalCustomerId === null;
      return {
        id: order.id,
        name: order.name,
        currency: order.currency,
        totalAmount: fromDb(order.totalAmount),
        customerId: erased ? null : order.customer.id,
        externalCustomerId: order.customer.externalCustomerId,
        ...cashbackAndStatus(order, order.ledgerEntries),
      };
    }),
    hasNext: orders.length > ORDER_PAGE_SIZE,
    needsLook,
  };
}

/** A payout as the order panel shows it: the buyer panel's facts and its own. */
export type PanelPayout = NonNullable<HistoryEntry["payout"]> & {
  id: string;
  sentAt: Date | null;
  shortfall: Decimal | null;
  /** Which send of it the panel shows, for its answers (payoutVersion, Ruling 67) */
  version: string;
};

export type OrderEntry = Omit<HistoryEntry, "payout"> & { payout: PanelPayout | null };

export type OrderRefund = {
  id: string;
  /** Shopify's id, which an import order's importRefundIds lists when the import counted it */
  externalRefundId: string;
  /** The product value it returned, in the order's currency */
  productAmount: Decimal;
  refundedAt: Date;
  /** Already on the order when RewardsPro recorded it (Ruling 24) */
  appliedBeforeCashback: boolean;
  /**
   * Its take-back: what the ledger's reversal asked for (positive, in the
   * cashback's currency) and where its payout stands, which says what was
   * actually taken (debitedAmount, null when Shopify never told). Null when
   * the refund took nothing off the cashback.
   */
  takeBack: {
    amount: Decimal;
    currency: string;
    state: NonNullable<OrderEntry["payout"]>["state"] | null;
    debitedAmount: Decimal | null;
  } | null;
  /** The past-orders import counted it already (Ruling 54) */
  countedAtImport: boolean;
};

export interface OrderPanel {
  id: string;
  name: string;
  source: "live" | "import";
  test: boolean;
  cancelledAt: Date | null;
  noCashbackReason: NoCashbackReason | null;
  currency: string;
  totalAmount: Decimal;
  productAmount: Decimal;
  storeCreditUsed: Decimal;
  giftCardUsed: Decimal;
  cashbackBase: Decimal;
  /** The order's processedAt (Ruling 27) */
  paidAt: Date;
  /** Null once the buyer was erased */
  customerId: string | null;
  externalCustomerId: string | null;
  status: OrderStatus;
  /** Every ledger entry of the order, newest first, each with its payout */
  entries: OrderEntry[];
  /** Newest first */
  refunds: OrderRefund[];
}

/**
 * The order panel's facts (spec 4.6) for one of the store's orders: the
 * order, its status, its ledger entries with their payouts, and its refunds
 * with what each took back. Null when the order is not the store's or
 * `orderId` is no id at all. An order holds one cashback entry and a few
 * take-backs and adjustments, so everything is read.
 */
export async function orderPanel(conn: ConnectionContext, orderId: string): Promise<OrderPanel | null> {
  if (!UUID.test(orderId)) return null;
  const order = await prisma.order.findFirst({
    where: { id: orderId, merchantId: conn.merchantId, connectionId: conn.connectionId },
    select: {
      id: true,
      name: true,
      source: true,
      test: true,
      cancelledAt: true,
      noCashbackReason: true,
      currency: true,
      totalAmount: true,
      productAmount: true,
      storeCreditUsed: true,
      giftCardUsed: true,
      cashbackBase: true,
      paidAt: true,
      importRefundIds: true,
      customer: { select: { id: true, externalCustomerId: true } },
      refunds: {
        orderBy: [{ refundedAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          externalRefundId: true,
          productAmount: true,
          refundedAt: true,
          appliedBeforeCashback: true,
          ledgerEntries: {
            where: { kind: "reversal" },
            select: { amount: true, currency: true, payout: { select: { state: true, debitedAmount: true } } },
          },
        },
      },
    },
  });
  if (!order) return null;

  const entries = await prisma.ledgerEntry.findMany({
    where: { merchantId: conn.merchantId, orderId: order.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      kind: true,
      amount: true,
      currency: true,
      tierName: true,
      ratePercent: true,
      idempotencyKey: true,
      createdAt: true,
      payout: {
        select: {
          id: true,
          direction: true,
          state: true,
          lookReason: true,
          amount: true,
          debitedAmount: true,
          shortfall: true,
          unconfirmedAt: true,
          lastError: true,
          sentAt: true,
          claimedAt: true,
          updatedAt: true,
        },
      },
    },
  });
  const orNull = (value: Prisma.Decimal | null) => (value === null ? null : fromDb(value));
  const erased = order.customer.externalCustomerId === null;

  return {
    id: order.id,
    name: order.name,
    source: order.source,
    test: order.test,
    cancelledAt: order.cancelledAt,
    noCashbackReason: order.noCashbackReason,
    currency: order.currency,
    totalAmount: fromDb(order.totalAmount),
    productAmount: fromDb(order.productAmount),
    storeCreditUsed: fromDb(order.storeCreditUsed),
    giftCardUsed: fromDb(order.giftCardUsed),
    cashbackBase: fromDb(order.cashbackBase),
    paidAt: order.paidAt,
    customerId: erased ? null : order.customer.id,
    externalCustomerId: order.customer.externalCustomerId,
    status: cashbackAndStatus(order, entries).status,
    entries: entries.map((entry) => ({
      kind: entry.kind,
      amount: fromDb(entry.amount),
      currency: entry.currency,
      tierName: entry.tierName,
      ratePercent: orNull(entry.ratePercent),
      idempotencyKey: entry.idempotencyKey,
      createdAt: entry.createdAt,
      orderId: order.id,
      orderName: order.name,
      payout: entry.payout
        ? {
            id: entry.payout.id,
            direction: entry.payout.direction,
            state: entry.payout.state,
            lookReason: entry.payout.lookReason,
            amount: fromDb(entry.payout.amount),
            debitedAmount: orNull(entry.payout.debitedAmount),
            shortfall: orNull(entry.payout.shortfall),
            unconfirmedAt: entry.payout.unconfirmedAt,
            lastError: entry.payout.lastError,
            sentAt: entry.payout.sentAt,
            version: payoutVersion(entry.payout),
          }
        : null,
    })),
    refunds: order.refunds.map((refund) => {
      // One reversal per refund (its key is the refund's id), in the cashback's currency
      const [reversal] = refund.ledgerEntries;
      const taken = reversal ? fromDb(reversal.amount).abs() : new Money(0);
      return {
        id: refund.id,
        externalRefundId: refund.externalRefundId,
        productAmount: fromDb(refund.productAmount),
        refundedAt: refund.refundedAt,
        appliedBeforeCashback: refund.appliedBeforeCashback,
        takeBack:
          reversal && taken.gt(0)
            ? {
                amount: taken,
                currency: reversal.currency,
                state: reversal.payout?.state ?? null,
                debitedAmount: reversal.payout?.debitedAmount ? fromDb(reversal.payout.debitedAmount) : null,
              }
            : null,
        countedAtImport: order.source === "import" && order.importRefundIds.includes(refund.externalRefundId),
      };
    }),
  };
}

/**
 * Whether `payoutId` is a payout of `orderId`, an order of the store: the
 * order panel's answers act only on the order's own payouts.
 */
export async function orderHasPayout(conn: ConnectionContext, orderId: string, payoutId: string): Promise<boolean> {
  if (!UUID.test(orderId) || !UUID.test(payoutId)) return false;
  const payout = await prisma.payout.findFirst({
    where: { id: payoutId, merchantId: conn.merchantId, ledgerEntry: { orderId, order: { connectionId: conn.connectionId } } },
    select: { id: true },
  });
  return payout !== null;
}
