/**
 * Tiers (spec 6.3 rules 2 and 10, section 4.5).
 *
 * Tier spend is rule 1's product value minus the product value refunded, in
 * the shop's currency, over orders counted by their created date within the
 * merchant's window (the last 12 months, or all time). Test and cancelled
 * orders count nowhere (plan Decision 7); imported orders count (rule 11).
 * A buyer qualifies for the tier with the highest minimum at or below their
 * spend; progress toward the next tier is measured from the same spend.
 *
 * `resolveTier` is the only writer of a buyer's tier after the buyer is
 * created (recordOrder places a new buyer in the lowest tier). It reads
 * everything first and throws on any failed read, writing nothing (carried
 * from PR #137), so a dropped connection never reads as "no spend" and
 * drops a buyer's tier. A tier the merchant locked a buyer to wins over
 * spend. The nightly pass (`runTierPass`) resolves every buyer of a store,
 * the never-resolved first, then the longest unresolved, and stops at its
 * deadline for the next run to carry on.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { Decimal } from "decimal.js";
import prisma from "~/db.server";
import { Money, fromDb } from "./money";

export type TierWindow = "rolling_12_months" | "lifetime";

export type TierRow = { id: string; name: string; minSpend: Decimal; cashbackPercent: Decimal; position: number };

export interface Progress {
  /** Whole percent of the way from the current tier's minimum to the next one's: floored, at most 99 below the top, 100 at it. */
  percent: number;
  nextTierName: string | null;
  nextTierPercent: Decimal | null;
  nextTierMin: Decimal | null;
  /** What is left to spend to reach the next tier, never below 0. */
  amountRemaining: Decimal;
  isTop: boolean;
}

type Db = PrismaClient | Prisma.TransactionClient;

/** How many times a resolve starts over when the buyer's row changed under it. */
const RESOLVE_ATTEMPTS = 3;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where the window's spend starts: for the rolling window, the same instant
 * one calendar year earlier (in UTC; a year before 29 February is
 * 28 February, as Postgres's `- interval '1 year'` gives); null for all time.
 */
export function windowStart(window: TierWindow, now: Date): Date | null {
  if (window === "lifetime") return null;
  if (window !== "rolling_12_months") throw new RangeError(`Unknown tier window ${JSON.stringify(window)}`);
  const year = now.getUTCFullYear() - 1;
  const month = now.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const start = new Date(now.getTime());
  start.setUTCFullYear(year, month, Math.min(now.getUTCDate(), lastDay));
  return start;
}

/**
 * A buyer's tier spend at `now` over `window` (rule 10), never below 0.
 * An order whose refunds exceed its value adds 0 rather than lowering the
 * rest: the order source already caps refunds at the order's product value,
 * and this holds even if a row says otherwise (Ruling 20).
 */
export async function tierSpend(customerId: string, window: TierWindow, now: Date, db: Db = prisma): Promise<Decimal> {
  const start = windowStart(window, now);
  const { _sum } = await db.order.aggregate({
    _sum: { shopProductAmount: true, shopRefundedProductAmount: true },
    where: {
      customerId,
      test: false,
      cancelledAt: null,
      orderedAt: start ? { gte: start } : undefined,
      shopRefundedProductAmount: { lte: db.order.fields.shopProductAmount },
    },
  });
  const spend = fromDb(_sum.shopProductAmount ?? 0).minus(fromDb(_sum.shopRefundedProductAmount ?? 0));
  return Money.max(0, spend);
}

/** Lowest first: by minimum spend, then position, then id (as recordOrder picks the lowest). */
function byMinimum(tiers: TierRow[]): TierRow[] {
  return [...tiers].sort(
    (a, b) => a.minSpend.comparedTo(b.minSpend) || a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/**
 * The tier `spend` qualifies for: the highest minimum at or below it. Spend
 * below every minimum gets the lowest tier (rule 2; the lowest minimum is 0
 * in the admin). Throws RangeError for an empty list.
 */
export function qualify(spend: Decimal, tiers: TierRow[]): TierRow {
  const sorted = byMinimum(tiers);
  if (sorted.length === 0) throw new RangeError("No tiers to qualify for");
  let chosen = sorted[0];
  for (const tier of sorted) {
    if (tier.minSpend.lte(spend) && tier.minSpend.gt(chosen.minSpend)) chosen = tier;
  }
  return chosen;
}

/**
 * Progress from the held tier toward the next one, from the same spend that
 * decides the tier (rule 10). Carried from calculateProgress
 * (customer-tier-state-update.server.ts) in exact decimals, floored instead
 * of rounded so it never shows 100 before the tier is reached. A tier id not
 * among `tiers` counts as the lowest tier (rule 2).
 */
export function progress(spend: Decimal, currentTierId: string, tiers: TierRow[]): Progress {
  const sorted = byMinimum(tiers);
  const none = { nextTierName: null, nextTierPercent: null, nextTierMin: null, amountRemaining: new Money(0) };
  if (sorted.length === 0) return { percent: 0, ...none, isTop: false };
  const index = Math.max(0, sorted.findIndex((t) => t.id === currentTierId));
  if (index === sorted.length - 1) return { percent: 100, ...none, isTop: true };

  const current = sorted[index];
  const next = sorted[index + 1];
  const range = next.minSpend.minus(current.minSpend);
  // (spend − current) × 100 ÷ range, as an exact integer division
  const percent = range.lte(0)
    ? 99
    : Math.min(99, Math.max(0, new Money(spend).minus(current.minSpend).times(100).divToInt(range).toNumber()));
  return {
    percent,
    nextTierName: next.name,
    nextTierPercent: next.cashbackPercent,
    nextTierMin: next.minSpend,
    amountRemaining: Money.max(0, next.minSpend.minus(spend)),
    isTop: false,
  };
}

async function readTiers(db: Db, merchantId: string, excludeTierId?: string): Promise<TierRow[]> {
  const rows = await db.tier.findMany({
    where: { merchantId, ...(excludeTierId ? { id: { not: excludeTierId } } : {}) },
    select: { id: true, name: true, minSpend: true, cashbackPercent: true, position: true },
  });
  return rows.map((t) => ({ ...t, minSpend: fromDb(t.minSpend), cashbackPercent: fromDb(t.cashbackPercent) }));
}

/**
 * Put a buyer in the tier they should hold: the tier they are locked to,
 * else the one their spend qualifies for. With no tiers at all the buyer
 * holds none (`tierId` null). When the tier is unchanged only `resolvedAt`
 * is stamped; otherwise `tierId`, `tierSince` and `resolvedAt` are written.
 *
 * Every read comes before the write, and a failed read throws with nothing
 * written. The write is conditional on the row as it was read (tier, lock,
 * resolvedAt), so a lock or another resolve landing in between makes this
 * one start over on fresh reads instead of overwriting it.
 *
 * `tx` runs it inside the caller's transaction; `excludeTierId` resolves as
 * if that tier were gone (a lock to it included), so a tier delete can move
 * its members off it in the delete's own transaction (A20).
 */
export async function resolveTier(
  customerId: string,
  o: { now?: Date; tx?: Prisma.TransactionClient; excludeTierId?: string } = {},
): Promise<{ changed: boolean; tierId: string | null }> {
  const db: Db = o.tx ?? prisma;
  for (let attempt = 1; ; attempt++) {
    const now = o.now ?? new Date();
    const customer = await db.customer.findUniqueOrThrow({
      where: { id: customerId },
      select: { merchantId: true, tierId: true, lockedTierId: true, resolvedAt: true, merchant: { select: { tierWindow: true } } },
    });
    const tiers = await readTiers(db, customer.merchantId, o.excludeTierId);
    const locked = tiers.find((t) => t.id === customer.lockedTierId);
    let target: TierRow | null = locked ?? null;
    if (!target && tiers.length > 0) {
      target = qualify(await tierSpend(customerId, customer.merchant.tierWindow, now, db), tiers);
    }

    const tierId = target?.id ?? null;
    const changed = tierId !== customer.tierId;
    const { count } = await db.customer.updateMany({
      where: { id: customerId, tierId: customer.tierId, lockedTierId: customer.lockedTierId, resolvedAt: customer.resolvedAt },
      data: changed ? { tierId, tierSince: tierId ? now : null, resolvedAt: now } : { resolvedAt: now },
    });
    if (count === 1) return { changed, tierId };
    if (attempt >= RESOLVE_ATTEMPTS) {
      throw new Error(`The tier of customer ${customerId} kept changing while it was resolved`);
    }
  }
}

/**
 * Lock a buyer to one of the merchant's tiers, or with null return them to
 * automatic, then resolve their tier; both in one transaction, so a failed
 * resolve leaves the lock as it was. Locking a buyer to the tier they hold is
 * allowed. `ok: false` when the buyer or the tier is not the merchant's.
 */
export async function lockTier(merchantId: string, customerId: string, tierId: string | null): Promise<{ ok: boolean }> {
  if (!UUID.test(merchantId) || !UUID.test(customerId) || (tierId !== null && !UUID.test(tierId))) return { ok: false };
  return prisma.$transaction(async (tx) => {
    if (tierId !== null && (await tx.tier.count({ where: { id: tierId, merchantId } })) === 0) return { ok: false };
    const { count } = await tx.customer.updateMany({ where: { id: customerId, merchantId }, data: { lockedTierId: tierId } });
    if (count === 0) return { ok: false };
    await resolveTier(customerId, { tx });
    return { ok: true };
  });
}

/**
 * Resolve the buyers of one store, carrying recalculateTiersForAllCustomers's
 * order: those never resolved first (by id), then those last resolved before
 * `resolvedBefore`, oldest first. The deadline (epoch ms) is checked before
 * each buyer; a pass that runs out is `complete: false` and the next run
 * carries on from where it stopped, since resolved buyers are stamped. A
 * buyer whose resolve fails keeps their tier and counts as an error
 * (`firstError` is the first one).
 */
export async function runTierPass(
  connectionId: string,
  o: { deadline: number; resolvedBefore: Date },
): Promise<{ processed: number; remaining: number; changed: number; errors: number; complete: boolean; firstError?: unknown }> {
  const customers = [
    ...(await prisma.customer.findMany({
      where: { connectionId, resolvedAt: null },
      select: { id: true },
      orderBy: { id: "asc" },
    })),
    ...(await prisma.customer.findMany({
      where: { connectionId, resolvedAt: { lt: o.resolvedBefore } },
      select: { id: true },
      orderBy: [{ resolvedAt: "asc" }, { id: "asc" }],
    })),
  ];

  let processed = 0;
  let changed = 0;
  let errors = 0;
  let complete = true;
  let firstError: unknown;
  for (const { id } of customers) {
    if (Date.now() >= o.deadline) {
      complete = false;
      break;
    }
    processed++;
    try {
      if ((await resolveTier(id)).changed) changed++;
    } catch (error) {
      if (errors === 0) firstError = error;
      errors++;
      console.error(`[tiers] could not resolve the tier of customer ${id}:`, error instanceof Error ? error.message : String(error));
    }
  }
  const summary = { processed, remaining: customers.length - processed, changed, errors, complete };
  return errors > 0 ? { ...summary, firstError } : summary;
}
