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
 *
 * Every tier writer that runs in a transaction takes the merchant's row
 * first (lockMerchantTiers): saves, deletes, the base rate and lockTier, so
 * they apply one after another and a lock never races a delete (Ruling 61).
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import type { Decimal } from "decimal.js";
import prisma, { databaseSchema } from "~/db.server";
import { acquireCronLock, releaseCronLock } from "./cron.server";
import { WHOLE_AMOUNT } from "./ladder";
import { Money, fromDb } from "./money";
import { UUID } from "./uuid";
import { waitUntil } from "./wait-until.server";

/** The name of the tier the base rate creates. */
export const BASE_TIER_NAME = "Everyone";

/** A percent as the merchant types it, the base rate's or a tier's: a whole number from 0 to 100, or null. */
export function parseBaseRate(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{1,3}$/.test(value.trim())) return null;
  const percent = Number(value.trim());
  return percent <= 100 ? percent : null;
}

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
  const { _sum } = await db.order.aggregate({
    _sum: { shopProductAmount: true, shopRefundedProductAmount: true },
    where: { customerId, ...spendCounted(window, now, db) },
  });
  return spendOf(_sum);
}

/**
 * The orders tier spend counts at `now` over `window` (rule 10, Decision 7),
 * for tierSpend and the Customers page alike, so both say one figure.
 */
export function spendCounted(window: TierWindow, now: Date, db: Db = prisma): Prisma.OrderWhereInput {
  const start = windowStart(window, now);
  return {
    test: false,
    cancelledAt: null,
    orderedAt: start ? { gte: start } : undefined,
    shopRefundedProductAmount: { lte: db.order.fields.shopProductAmount },
  };
}

/** Spend from the sums of spendCounted's orders, never below 0. */
export function spendOf(sum: { shopProductAmount: Prisma.Decimal | null; shopRefundedProductAmount: Prisma.Decimal | null }): Decimal {
  return Money.max(0, fromDb(sum.shopProductAmount ?? 0).minus(fromDb(sum.shopRefundedProductAmount ?? 0)));
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
 * among `tiers` counts as the lowest tier (rule 2). The next tier is the
 * first with a higher minimum: one that shares the current minimum can't be
 * reached by spending (qualify keeps the first of them), so with only such
 * tiers above, the buyer is at the top (A12-F2).
 */
export function progress(spend: Decimal, currentTierId: string, tiers: TierRow[]): Progress {
  const sorted = byMinimum(tiers);
  const none = { nextTierName: null, nextTierPercent: null, nextTierMin: null, amountRemaining: new Money(0) };
  if (sorted.length === 0) return { percent: 0, ...none, isTop: false };
  const index = Math.max(0, sorted.findIndex((t) => t.id === currentTierId));
  const current = sorted[index];
  const next = sorted.slice(index + 1).find((t) => t.minSpend.gt(current.minSpend));
  if (!next) return { percent: 100, ...none, isTop: true };

  const range = next.minSpend.minus(current.minSpend);
  // (spend − current) × 100 ÷ range, as an exact integer division
  const percent = Math.min(99, Math.max(0, new Money(spend).minus(current.minSpend).times(100).divToInt(range).toNumber()));
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
 * A merchant's tiers, lowest first, read the one way the tier engine reads
 * them, without the member counts only the Tiers page and Home show (the app
 * proxy, the Customers filter and the buyer panel use these, OPERATIONS-2).
 */
export async function tiersOf(merchantId: string): Promise<TierRow[]> {
  return byMinimum(await readTiers(prisma, merchantId));
}

/** A write of a customer's tier refused because that tier no longer exists (its foreign key). */
function isTierForeignKeyViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003" &&
    /tier_id/.test(`${JSON.stringify(error.meta ?? {})} ${error.message}`)
  );
}

/**
 * A statement Postgres aborted to break a deadlock (40P01). Prisma passes it
 * through as an unknown request error naming the code, or as P2034.
 */
export function isDeadlock(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === "P2034" || /\b40P01\b/.test(error.message);
  return error instanceof Prisma.PrismaClientUnknownRequestError && /\b40P01\b/.test(error.message);
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
 * On its own (no `tx`), a write that a tier delete refused starts over the
 * same way, at most RESOLVE_ATTEMPTS times in all: the tier it chose was
 * deleted meanwhile (its foreign key), or the write met the delete clearing
 * this buyer's lock to that tier and Postgres broke the deadlock by aborting
 * it (Ruling 61).
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
    let count: number;
    try {
      ({ count } = await db.customer.updateMany({
        where: { id: customerId, tierId: customer.tierId, lockedTierId: customer.lockedTierId, resolvedAt: customer.resolvedAt },
        data: changed ? { tierId, tierSince: tierId ? now : null, resolvedAt: now } : { resolvedAt: now },
      }));
    } catch (error) {
      // The tier it chose was deleted since it read the tiers, or the write
      // deadlocked with that delete: start over on fresh reads (CONCURRENCY-6,
      // Ruling 61). Not inside a caller's transaction, which the failed
      // statement has aborted.
      if (o.tx || !(isTierForeignKeyViolation(error) || isDeadlock(error))) throw error;
      count = 0;
    }
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
 * allowed. `ok: false` when the buyer or the tier is not the merchant's,
 * which includes a tier deleted meanwhile.
 *
 * The merchant's row comes first, as in every tier change (Ruling 61): behind
 * a tier delete this waits for it, then reads the tiers it left, so neither a
 * lock to the deleted tier nor an automatic resolve that would have chosen it
 * meets the delete half done. Nothing takes a buyer's row and then waits on
 * the merchant's, so this adds no cycle.
 */
export async function lockTier(merchantId: string, customerId: string, tierId: string | null): Promise<{ ok: boolean }> {
  if (!UUID.test(merchantId) || !UUID.test(customerId) || (tierId !== null && !UUID.test(tierId))) return { ok: false };
  return prisma.$transaction(async (tx) => {
    await lockMerchantTiers(tx, merchantId);
    if (tierId !== null && (await tx.tier.count({ where: { id: tierId, merchantId } })) === 0) return { ok: false };
    const { count } = await tx.customer.updateMany({ where: { id: customerId, merchantId }, data: { lockedTierId: tierId } });
    if (count === 0) return { ok: false };
    await resolveTier(customerId, { tx });
    return { ok: true };
  }, TIER_CHANGE_TRANSACTION);
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

/**
 * The base cashback rate from Home's setup card (spec 4.3): with no tiers it
 * creates the lowest tier, BASE_TIER_NAME with minimum spend 0
 * (`created: true`, after which the caller places the buyers); otherwise it
 * sets the lowest tier's rate. The merchant row is locked first, so two
 * saves at once never make two lowest tiers.
 */
export async function setBaseRate(merchantId: string, percent: number): Promise<{ created: boolean; tierId: string }> {
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) throw new RangeError(`Not a whole percent from 0 to 100: ${percent}`);
  return prisma.$transaction(async (tx) => {
    await lockMerchantTiers(tx, merchantId, "FOR UPDATE");
    const [lowest] = byMinimum(await readTiers(tx, merchantId));
    if (lowest) {
      await tx.tier.update({ where: { id: lowest.id }, data: { cashbackPercent: new Prisma.Decimal(percent) } });
      return { created: false, tierId: lowest.id };
    }
    const tier = await tx.tier.create({
      data: { merchantId, name: BASE_TIER_NAME, minSpend: new Prisma.Decimal(0), cashbackPercent: new Prisma.Decimal(percent), position: 0 },
      select: { id: true },
    });
    return { created: true, tierId: tier.id };
  });
}

/** How long the pass run after a tier save may take; the nightly pass finishes the rest. */
export const AFTER_SAVE_PASS_MS = 25_000;
/** The after-save pass's lease on its store (cron_lock): past its pass's time, so a crashed holder's runs out soon after. */
const TIER_PASS_LEASE_MINUTES = 1;

const tierPassLease = (connectionId: string) => `tier-pass:${connectionId}`;

/**
 * After a change that can move buyers between tiers (a minimum, the set of
 * tiers or the window): ask for a pass (`tierPassRequestedAt`, which the
 * nightly pass honours; a later request is never moved back) and run one
 * after the response, for AFTER_SAVE_PASS_MS, under the store's lease
 * `tier-pass:<connectionId>` (Ruling 77). While another after-save pass holds
 * it, this one is skipped: that pass takes the newest request before it
 * finishes, and the nightly pass the rest.
 */
export async function requestTierPass(connectionId: string, now: Date = new Date()): Promise<void> {
  await prisma.connection.updateMany({
    where: { id: connectionId, OR: [{ tierPassRequestedAt: null }, { tierPassRequestedAt: { lt: now } }] },
    data: { tierPassRequestedAt: now },
  });
  waitUntil(passWhileRequested(connectionId, now.getTime() + AFTER_SAVE_PASS_MS));
}

/**
 * Run the store's requested passes until none is left or `deadline` comes,
 * holding its lease: each pass resolves the buyers last resolved before the
 * newest request; a request made meanwhile, its own pass skipped by the
 * lease, is taken by the next round, after the lease is let go too.
 */
async function passWhileRequested(connectionId: string, deadline: number): Promise<void> {
  const lease = await acquireCronLock(tierPassLease(connectionId), TIER_PASS_LEASE_MINUTES);
  if (!lease.acquired || !lease.lockId) return;
  const requested = async () =>
    (await prisma.connection.findUnique({ where: { id: connectionId }, select: { tierPassRequestedAt: true } }))?.tierPassRequestedAt ?? null;
  let done = 0;
  try {
    for (let asked = await requested(); asked !== null && asked.getTime() > done && Date.now() < deadline; asked = await requested()) {
      const pass = await runTierPass(connectionId, { deadline, resolvedBefore: asked });
      if (!pass.complete) return;
      done = asked.getTime();
    }
  } finally {
    await releaseCronLock(lease.lockId);
  }
  // A request whose pass met the lease just before it was let go
  const asked = await requested();
  if (asked !== null && asked.getTime() > done && Date.now() < deadline) await passWhileRequested(connectionId, deadline);
}

/**
 * Whether a requested tier pass has still to reach some of the store's
 * buyers (Ruling 76): one resolved before the request, or never resolved,
 * the buyers runTierPass works through. Both times are the app's own clock
 * (the request and each resolve stamp new Date()); the database's
 * createdAt is never compared with them (M3b-F6). A buyer first seen after
 * the request waits only until their own resolve, which orders/paid runs at
 * once. Tiers (and Home) say buyers are moving meanwhile.
 */
export async function tierPassPending(connectionId: string): Promise<boolean> {
  const connection = await prisma.connection.findUnique({ where: { id: connectionId }, select: { tierPassRequestedAt: true } });
  const asked = connection?.tierPassRequestedAt ?? null;
  if (asked === null) return false;
  const waiting = await prisma.customer.findFirst({
    where: { connectionId, OR: [{ resolvedAt: { lt: asked } }, { resolvedAt: null }] },
    select: { id: true },
  });
  return waiting !== null;
}

/** The longest a tier's name may be, in characters. */
export const TIER_NAME_MAX = 40;

/** A tier change's problems: by field, or `form` for the whole change. */
export type TierErrors = Partial<Record<"name" | "minSpend" | "percent" | "form", string>>;

export const TIER_ERRORS = {
  nameMissing: "Enter a name.",
  nameTooLong: `Use ${TIER_NAME_MAX} characters or fewer.`,
  minSpend: "Enter a whole number of 0 or more.",
  minSpendTaken: "Another tier has this minimum spend.",
  percent: "Enter a whole number from 0 to 100.",
  gone: "This tier is no longer there. Reload the page.",
  changed: "This tier changed since you opened it. Reload the page.",
  lowest: "The lowest tier can't be deleted: every buyer starts there.",
  busy: "The tier couldn't be deleted just now. Try again.",
  ladderOrder: "Start each tier above the one before.",
  ladderStale: "Your tiers changed since you opened this page.",
  ladderShape: "Set up exactly three tiers.",
} as const;

/** A tier's name as typed, trimmed, with its problem if it has one: 1 to TIER_NAME_MAX characters. */
function tierName(value: unknown): { name: string; error?: string } {
  const name = typeof value === "string" ? value.trim() : "";
  if (name === "") return { name, error: TIER_ERRORS.nameMissing };
  if ([...name].length > TIER_NAME_MAX) return { name, error: TIER_ERRORS.nameTooLong };
  return { name };
}

/**
 * A tier change runs under its merchant's row, taken FOR NO KEY UPDATE:
 * every other tier change waits on it (and setBaseRate's FOR UPDATE, and
 * setRunning's UPDATE), so they see one another's tiers whole, while the
 * KEY SHARE checks of rows inserted under the merchant (orders, ledger
 * entries, payouts) don't wait. A delete can take a while with many
 * members, hence the timeout.
 */
const TIER_CHANGE_TRANSACTION = { timeout: 60_000, maxWait: 10_000 };

async function lockMerchantTiers(
  tx: Prisma.TransactionClient,
  merchantId: string,
  mode: "FOR NO KEY UPDATE" | "FOR UPDATE" = "FOR NO KEY UPDATE",
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM ${Prisma.raw(`"${databaseSchema}"."merchant"`)} WHERE id = ${merchantId}::uuid ${Prisma.raw(mode)}`;
}

/** Which version of a tier a page showed: when it last changed (CONCURRENCY-3). */
export function tierVersion(tier: { updatedAt: Date }): string {
  return tier.updatedAt.toISOString();
}

/**
 * A merchant's tiers for the Tiers page, lowest first, with their members:
 * the buyers who hold each, erased ones aside (customers/redact keeps the
 * row without its Shopify id, and the Customers list leaves it out, TRUTH-9).
 */
export async function tierTable(merchantId: string): Promise<Array<TierRow & { members: number; lowest: boolean; version: string }>> {
  const rows = await prisma.tier.findMany({
    where: { merchantId },
    select: {
      id: true,
      name: true,
      minSpend: true,
      cashbackPercent: true,
      position: true,
      updatedAt: true,
      _count: { select: { members: { where: { externalCustomerId: { not: null } } } } },
    },
  });
  const members = new Map(rows.map((t) => [t.id, t._count.members]));
  const versions = new Map(rows.map((t) => [t.id, tierVersion(t)]));
  const tiers = byMinimum(
    rows.map((t) => ({ id: t.id, name: t.name, minSpend: fromDb(t.minSpend), cashbackPercent: fromDb(t.cashbackPercent), position: t.position })),
  );
  return tiers.map((tier, i) => ({ ...tier, members: members.get(tier.id) ?? 0, lowest: i === 0, version: versions.get(tier.id)! }));
}

/**
 * Add a tier (`id` null) or edit one, from the Tiers page's fields as typed
 * (spec 4.5): a name of 1 to TIER_NAME_MAX characters, trimmed; a whole
 * minimum spend of 0 or more, in the shop's currency, that no other of the
 * merchant's tiers has (A12-F2; the database holds the same rule); a whole
 * cashback percent from 0 to 100. The lowest tier's minimum is fixed at 0:
 * a store's first tier starts at 0 and an edit of the lowest tier keeps its
 * minimum, whatever `minSpend` says. Every problem is reported at once and
 * nothing is written. `form: gone` when `id` is not one of the merchant's
 * tiers; `form: changed` when the caller says which version of the tier its
 * edit was made on (`version`, from tierVersion; the page always does, null
 * when its post named none) and the tier has changed since (CONCURRENCY-3):
 * an edit re-sends every field, so it would undo the other save.
 * `movesBuyers` says whether the change can move buyers between tiers (a new
 * tier, or a new minimum); only then does the caller ask for a tier pass
 * (requestTierPass, Ruling 77). A rename or a rate change moves no one.
 */
export async function saveTier(
  merchantId: string,
  input: { id: string | null; name: unknown; minSpend: unknown; percent: unknown; version?: string | null },
  db: PrismaClient = prisma,
): Promise<{ ok: true; tierId: string; movesBuyers: boolean } | { ok: false; errors: TierErrors }> {
  const gone = { ok: false as const, errors: { form: TIER_ERRORS.gone } };
  if (!UUID.test(merchantId) || (input.id !== null && !UUID.test(input.id))) return gone;

  const errors: TierErrors = {};
  const { name, error: nameError } = tierName(input.name);
  if (nameError) errors.name = nameError;
  const typedMin = typeof input.minSpend === "string" ? input.minSpend.trim() : "";
  const minSpend = WHOLE_AMOUNT.test(typedMin) ? new Prisma.Decimal(typedMin) : null;
  const percent = parseBaseRate(input.percent);
  if (percent === null) errors.percent = TIER_ERRORS.percent;

  return db.$transaction(async (tx) => {
    await lockMerchantTiers(tx, merchantId);
    const tiers = byMinimum(await readTiers(tx, merchantId));
    const editing = input.id === null ? null : (tiers.find((t) => t.id === input.id) ?? null);
    if (input.id !== null && !editing) return gone;
    if (editing && input.version !== undefined) {
      const { updatedAt } = await tx.tier.findUniqueOrThrow({ where: { id: editing.id }, select: { updatedAt: true } });
      if (input.version !== tierVersion({ updatedAt })) return { ok: false as const, errors: { form: TIER_ERRORS.changed } };
    }
    const lowest = tiers.length === 0 || editing?.id === tiers[0].id;

    if (!lowest) {
      if (minSpend === null) errors.minSpend = TIER_ERRORS.minSpend;
      else if (tiers.some((t) => t.id !== editing?.id && t.minSpend.eq(minSpend.toString()))) errors.minSpend = TIER_ERRORS.minSpendTaken;
    }
    if (Object.keys(errors).length > 0 || percent === null) return { ok: false as const, errors };

    const cashbackPercent = new Prisma.Decimal(percent);
    if (editing) {
      await tx.tier.update({
        where: { id: editing.id },
        data: lowest ? { name, cashbackPercent } : { name, cashbackPercent, minSpend: minSpend! },
      });
      // The lowest tier's minimum stays 0
      return { ok: true as const, tierId: editing.id, movesBuyers: !lowest && !editing.minSpend.eq(minSpend!.toString()) };
    }
    const position = tiers.reduce((highest, t) => Math.max(highest, t.position + 1), 0);
    const created = await tx.tier.create({
      data: { merchantId, name, cashbackPercent, minSpend: lowest ? new Prisma.Decimal(0) : minSpend!, position },
      select: { id: true },
    });
    return { ok: true as const, tierId: created.id, movesBuyers: true };
  }, TIER_CHANGE_TRANSACTION);
}

/** One row of the guide's ladder (RP-24), its fields as typed. */
export type LadderRowInput = { name: unknown; minSpend: unknown; percent: unknown };

/** A ladder save's problems: each row's by field, as saveTier's, and `form` for the whole ladder. */
export type LadderErrors = { rows: [TierErrors, TierErrors, TierErrors]; form?: string };

/**
 * Whether the guide may write a store's ladder (RP-24): one with no tiers,
 * or with only the first tier Home's old card makes (BASE_TIER_NAME at 0)
 * while cashback is off. The guide never rewrites a live ladder.
 */
export function isFreshLadder(tiers: TierRow[], running: boolean): boolean {
  if (tiers.length === 0) return true;
  return tiers.length === 1 && tiers[0].name === BASE_TIER_NAME && tiers[0].minSpend.isZero() && !running;
}

/**
 * Save the guide's three tiers in one go (RP-24), from its fields as typed,
 * lowest first. Each row is checked by saveTier's rules (a name of 1 to
 * TIER_NAME_MAX characters, trimmed; a whole percent from 0 to 100; for rows
 * 2 and 3 a whole start of 0 or more), tier 1 starts at 0 whatever its row
 * says, and each start must be above the one before; every row's problems
 * come back at once and nothing is written. Then, in one transaction under
 * the merchant's row (FOR UPDATE, as setBaseRate), the store must still be
 * fresh (isFreshLadder), else `form: ladderStale` and nothing is written: a
 * tier saved meanwhile, from the Tiers page or another tab, wins. Home's
 * lone tier is kept by id, renamed and given tier 1's rate (its start stays
 * 0), or tier 1 is created at 0; tiers 2 and 3 are created above it. The
 * caller then asks for a tier pass and writes the widget config: new tiers
 * always move buyers.
 */
export async function saveLadder(
  merchantId: string,
  rows: LadderRowInput[],
  db: PrismaClient = prisma,
): Promise<{ ok: true; tierIds: [string, string, string] } | { ok: false; errors: LadderErrors }> {
  const refused = (form: string) => ({ ok: false as const, errors: { rows: [{}, {}, {}] as LadderErrors["rows"], form } });
  if (!Array.isArray(rows) || rows.length !== 3) return refused(TIER_ERRORS.ladderShape);
  if (!UUID.test(merchantId)) return refused(TIER_ERRORS.ladderStale);

  const errors: LadderErrors["rows"] = [{}, {}, {}];
  let below = new Prisma.Decimal(0);
  const ladder = rows.map((row, i) => {
    const rowErrors = errors[i];
    const { name, error: nameError } = tierName(row.name);
    if (nameError) rowErrors.name = nameError;
    let minSpend = new Prisma.Decimal(0);
    if (i > 0) {
      const typedMin = typeof row.minSpend === "string" ? row.minSpend.trim() : "";
      if (!WHOLE_AMOUNT.test(typedMin)) rowErrors.minSpend = TIER_ERRORS.minSpend;
      else {
        minSpend = new Prisma.Decimal(typedMin);
        if (!minSpend.gt(below)) rowErrors.minSpend = TIER_ERRORS.ladderOrder;
        below = minSpend;
      }
    }
    const percent = parseBaseRate(row.percent);
    if (percent === null) rowErrors.percent = TIER_ERRORS.percent;
    return { name, minSpend, cashbackPercent: new Prisma.Decimal(percent ?? 0) };
  });
  if (errors.some((rowErrors) => Object.keys(rowErrors).length > 0)) return { ok: false, errors: { rows: errors } };

  return db.$transaction(async (tx) => {
    await lockMerchantTiers(tx, merchantId, "FOR UPDATE");
    const tiers = byMinimum(await readTiers(tx, merchantId));
    const { running } = await tx.merchant.findUniqueOrThrow({ where: { id: merchantId }, select: { running: true } });
    if (!isFreshLadder(tiers, running)) return refused(TIER_ERRORS.ladderStale);

    const [first, second, third] = ladder;
    const [lone] = tiers;
    // Home's lone tier keeps its id and its start of 0
    if (lone) await tx.tier.update({ where: { id: lone.id }, data: { name: first.name, cashbackPercent: first.cashbackPercent } });
    const firstId = lone ? lone.id : (await tx.tier.create({ data: { merchantId, ...first, position: 0 }, select: { id: true } })).id;
    // Rising starts, created in order, never meet the unique (merchant_id, min_spend) index
    const secondId = (await tx.tier.create({ data: { merchantId, ...second, position: 1 }, select: { id: true } })).id;
    const thirdId = (await tx.tier.create({ data: { merchantId, ...third, position: 2 }, select: { id: true } })).id;
    return { ok: true as const, tierIds: [firstId, secondId, thirdId] as [string, string, string] };
  }, TIER_CHANGE_TRANSACTION);
}

/**
 * Delete one of the merchant's tiers, in one transaction (spec 4.5):
 * clear the locks of buyers locked to it, move each of its members through
 * resolveTier as if it were gone, then delete the row. The tier's row is
 * taken FOR UPDATE before its members are read, so a resolve writing this
 * tier meanwhile waits on its foreign key and starts over once it is gone
 * (CONCURRENCY-6). The lowest tier can't be deleted, so neither can a
 * store's last one: cashback is never left on with no tiers (A4). The
 * caller then asks for a tier pass for everyone else. The member moves stay
 * in this one transaction, which holds the merchant's row (and each moved
 * buyer's) for its length: a known limit, timed on a large tier at B2/B4
 * (Ruling 77).
 */
export async function deleteTier(
  merchantId: string,
  tierId: string,
  db: PrismaClient = prisma,
): Promise<{ ok: true; moved: number } | { ok: false; reason: "gone" | "lowest" }> {
  if (!UUID.test(merchantId) || !UUID.test(tierId)) return { ok: false, reason: "gone" };
  return db.$transaction(async (tx) => {
    await lockMerchantTiers(tx, merchantId);
    const held = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM ${Prisma.raw(`"${databaseSchema}"."tier"`)}
      WHERE id = ${tierId}::uuid AND merchant_id = ${merchantId}::uuid FOR UPDATE`;
    if (held.length === 0) return { ok: false as const, reason: "gone" as const };
    const [lowest] = byMinimum(await readTiers(tx, merchantId));
    if (lowest.id === tierId) return { ok: false as const, reason: "lowest" as const };

    const members = await tx.customer.findMany({
      where: { merchantId, OR: [{ tierId }, { lockedTierId: tierId }] },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    await tx.customer.updateMany({ where: { merchantId, lockedTierId: tierId }, data: { lockedTierId: null } });
    for (const { id } of members) await resolveTier(id, { tx, excludeTierId: tierId });
    await tx.tier.delete({ where: { id: tierId } });
    return { ok: true as const, moved: members.length };
  }, TIER_CHANGE_TRANSACTION);
}

/**
 * "Spend counted over" (spec 4.5). True when the window changed, and only
 * then does the caller ask for a tier pass (Ruling 77).
 */
export async function setTierWindow(merchantId: string, tierWindow: TierWindow): Promise<boolean> {
  const { count } = await prisma.merchant.updateMany({ where: { id: merchantId, tierWindow: { not: tierWindow } }, data: { tierWindow } });
  return count === 1;
}
