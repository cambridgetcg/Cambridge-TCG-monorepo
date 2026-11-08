/**
 * The guide's one read per store (RP-24 spec 4.4), in shop currency and
 * measured as tier placement measures it, so the picture can't disagree with
 * where buyers land:
 *
 * - Buyers: each of the connection's buyers (erased ones aside) at their
 *   tier spend, spendCounted's orders summed as spendOf sums them (product
 *   value less product value refunded, never below 0; test, cancelled and
 *   over-refunded orders left out; over the tier window), binned at a round
 *   width from the 99th percentile of those who spent anything.
 * - The replay (the cost line): each imported order's cashback base, reduced
 *   for refunds, binned by the spend its buyer had before that order (the
 *   tier it would have earned at, record-order.server.ts). Live orders add
 *   spend but no base. A base in another currency is converted at the
 *   order's own rate (its shop product value over its product value), and
 *   the answer says it's an estimate.
 * - The median counted order's product value, for step 1's example.
 *
 * Amounts leave as decimal text (Money's toFixed), never numbers.
 */
import { Prisma } from "@prisma/client";
import prisma, { databaseSchema } from "~/db.server";
import { MAX_BINS, binWidthFor } from "./ladder";
import type { ConnectionContext } from "./merchant.server";
import { Money } from "./money";
import { windowStart } from "./tiers.server";

export interface LadderData {
  binWidth: number;
  /** buyers[i]: buyers whose tier spend is in [i·w, (i+1)·w); the last bin holds everyone above */
  buyers: number[];
  /** earnBase[i]: imported orders' cashback base in shop currency (decimal text), by the buyer's spend before each order; always MAX_BINS long, the last bin holding everything above */
  earnBase: string[];
  /** Some base was converted from another currency at the order's own rate */
  estimate: boolean;
  spenders: number;
  p80: string | null;
  p95: string | null;
  /** The median counted order's product value in shop currency, for step 1's example */
  medianOrder: string | null;
}

type LadderConnection = Pick<ConnectionContext, "merchantId" | "connectionId" | "currency" | "tierWindow">;

const table = (name: string) => Prisma.raw(`"${databaseSchema}"."${name}"`);

/** Decimal text from Postgres (numeric(19,4) reads "50.0000") as Money writes it ("50"). */
const amountText = (text: string | null): string | null => (text === null ? null : new Money(text).toFixed());

/** The tier window's lower bound on `o.ordered_at`, or nothing for a lifetime window. */
function inWindow(conn: LadderConnection, now: Date): Prisma.Sql {
  const start = windowStart(conn.tierWindow, now);
  return start ? Prisma.sql`AND o.ordered_at >= ${start.toISOString()}::timestamptz AT TIME ZONE 'UTC'` : Prisma.empty;
}

/** Each of the connection's buyers, erased ones aside, with their tier spend (spendCounted's orders, spendOf's sum). */
function buyerSpend(conn: LadderConnection, now: Date): Prisma.Sql {
  return Prisma.sql`
    SELECT c.id,
           GREATEST(0, COALESCE(sum(o.shop_product_amount), 0) - COALESCE(sum(o.shop_refunded_product_amount), 0)) AS spend
    FROM ${table("customer")} c
    LEFT JOIN ${table("orders")} o
      ON o.customer_id = c.id
     AND o.test = false AND o.cancelled_at IS NULL
     AND o.shop_refunded_product_amount <= o.shop_product_amount
     ${inWindow(conn, now)}
    WHERE c.merchant_id = ${conn.merchantId}::uuid AND c.connection_id = ${conn.connectionId}::uuid
      AND c.external_customer_id IS NOT NULL
    GROUP BY c.id`;
}

/** The connection's orders the picture reads, from buyers who aren't erased: not test, not cancelled, in the window. */
function pictureOrders(conn: LadderConnection, now: Date): Prisma.Sql {
  return Prisma.sql`
    FROM ${table("orders")} o
    JOIN ${table("customer")} c ON c.id = o.customer_id
    WHERE o.merchant_id = ${conn.merchantId}::uuid AND o.connection_id = ${conn.connectionId}::uuid
      AND c.external_customer_id IS NOT NULL
      AND o.test = false AND o.cancelled_at IS NULL
      ${inWindow(conn, now)}`;
}

/** The orders tier spend counts: the picture's, less any refunded beyond its product value. */
const COUNTED = Prisma.sql`AND o.shop_refunded_product_amount <= o.shop_product_amount`;

/** A store's ladder: its buyers and the replay of its imported orders, in bins of one round width. */
export async function readLadder(conn: LadderConnection, now: Date): Promise<LadderData> {
  const [stats] = await prisma.$queryRaw<Array<{ spenders: number; p80: string | null; p95: string | null; p99: string | null }>>`
    WITH spend AS (${buyerSpend(conn, now)})
    SELECT count(*) FILTER (WHERE spend > 0)::int AS spenders,
           (percentile_disc(0.8) WITHIN GROUP (ORDER BY spend) FILTER (WHERE spend > 0))::text AS p80,
           (percentile_disc(0.95) WITHIN GROUP (ORDER BY spend) FILTER (WHERE spend > 0))::text AS p95,
           (percentile_disc(0.99) WITHIN GROUP (ORDER BY spend) FILTER (WHERE spend > 0))::text AS p99
    FROM spend`;
  const p99 = amountText(stats.p99);
  const binWidth = binWidthFor(p99 === null ? null : new Money(p99));
  const width = Prisma.sql`${binWidth}::numeric`;
  const lastBin = MAX_BINS - 1;

  const [buyerBins, replayBins, basics] = await Promise.all([
    prisma.$queryRaw<Array<{ bin: number; buyers: number }>>`
      WITH spend AS (${buyerSpend(conn, now)})
      SELECT LEAST(floor(spend / ${width}), ${lastBin})::int AS bin, count(*)::int AS buyers
      FROM spend
      GROUP BY 1`,
    prisma.$queryRaw<Array<{ bin: number; base: string; converted: boolean }>>`
      SELECT LEAST(floor(spend_before / ${width}), ${lastBin})::int AS bin,
             sum(net_base)::text AS base,
             bool_or(currency <> ${conn.currency}) AS converted
      FROM (
        SELECT o.source, o.currency,
               -- The base in shop currency, reduced for refunds (an over-refunded order adds nothing)
               COALESCE(
                 (CASE WHEN o.currency = ${conn.currency} THEN o.cashback_base
                       ELSE o.cashback_base * o.shop_product_amount / NULLIF(o.product_amount, 0) END)
                 * o.adds / NULLIF(o.shop_product_amount, 0),
                 0) AS net_base,
               -- The buyer's spend before this order: a window over an empty frame is NULL
               COALESCE(sum(o.adds) OVER (PARTITION BY o.customer_id ORDER BY o.ordered_at, o.id
                                          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS spend_before
        FROM (
          SELECT o.id, o.customer_id, o.ordered_at, o.source, o.currency, o.product_amount, o.shop_product_amount, o.cashback_base,
                 CASE WHEN o.shop_refunded_product_amount <= o.shop_product_amount
                      THEN o.shop_product_amount - o.shop_refunded_product_amount ELSE 0 END AS adds
          ${pictureOrders(conn, now)}
        ) o
      ) replay
      WHERE source = 'import'
      GROUP BY 1`,
    readGuideBasics(conn, now),
  ]);

  const buyers: number[] = Array.from({ length: MAX_BINS }, () => 0);
  for (const row of buyerBins) buyers[row.bin] = row.buyers;
  const earnBase: string[] = Array.from({ length: MAX_BINS }, () => "0");
  for (const row of replayBins) earnBase[row.bin] = new Money(row.base).toFixed();

  return {
    binWidth,
    buyers,
    earnBase,
    estimate: replayBins.some((row) => row.converted),
    spenders: stats.spenders,
    p80: amountText(stats.p80),
    p95: amountText(stats.p95),
    medianOrder: basics.medianOrder,
  };
}

/** Step 1's light read: the median counted order and whether any counted order was in another currency (same filters as readLadder). */
export async function readGuideBasics(conn: LadderConnection, now: Date): Promise<{ medianOrder: string | null; multiCurrency: boolean }> {
  const [row] = await prisma.$queryRaw<Array<{ median: string | null; multi: boolean | null }>>`
    SELECT (percentile_disc(0.5) WITHIN GROUP (ORDER BY o.shop_product_amount))::text AS median,
           bool_or(o.currency <> ${conn.currency}) AS multi
    ${pictureOrders(conn, now)}
    ${COUNTED}`;
  return { medianOrder: amountText(row.median), multiCurrency: row.multi === true };
}
