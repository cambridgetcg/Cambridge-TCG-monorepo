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
 */
import { Prisma } from "@prisma/client";
import type { Decimal } from "decimal.js";
import prisma, { databaseSchema } from "~/db.server";
import { daysEnding, reviewDue, rewardStatus } from "./home-rules";
import type { ConnectionContext } from "./merchant.server";
import { Money, fromDb } from "./money";

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
