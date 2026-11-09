import { Prisma, type PrismaClient } from "@prisma/client";
import prisma, { databaseSchema } from "~/db.server";

const testDatabaseUrl = process.env.REWARDS_TEST_DATABASE_URL?.trim();

/**
 * True only when env.ts (vitest.postgres.config.ts) has pointed the app's
 * client at the loopback test database. Under any other config
 * REWARDS_DATABASE_URL may name a real database, so these suites skip rather
 * than truncate it.
 */
export const hasTestDatabase = Boolean(testDatabaseUrl) && process.env.REWARDS_DATABASE_URL === testDatabaseUrl;

/**
 * Empty every table in the app schema except Prisma's migration ledger.
 * ledger_entry's append-only trigger refuses TRUNCATE too, so the reset runs
 * as the erasure purge does: in a transaction with SET LOCAL
 * rewards.erasing = 'on'.
 */
export async function resetDatabase(): Promise<void> {
  if (!hasTestDatabase) {
    throw new Error("resetDatabase runs only against REWARDS_TEST_DATABASE_URL (vitest.postgres.config.ts)");
  }
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename::text AS tablename FROM pg_tables
    WHERE schemaname = ${databaseSchema} AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const names = tables.map(({ tablename }) => `"${databaseSchema}"."${tablename}"`).join(", ");
  await prisma.$transaction([
    prisma.$executeRaw`SET LOCAL rewards.erasing = 'on'`,
    prisma.$executeRaw`TRUNCATE ${Prisma.raw(names)} RESTART IDENTITY CASCADE`,
  ]);
}

const failedCallRestores: Array<() => void> = [];

/**
 * Make the next call of one Prisma model method reject with `error`, as a
 * dropped pooled connection would. vi.spyOn can't do this: its restore leaves
 * the client's model method undefined. Undo with restoreFailedCalls().
 * `model` is any model, by its name ("LedgerEntry") or its client key
 * ("ledgerEntry").
 *
 * It patches `prisma.<model>` only. Inside an interactive
 * `prisma.$transaction(async (tx) => ...)`, `tx.<model>` is a separate
 * delegate that this patch does not reach, so tests must not rely on it to
 * fail a call made through `tx`.
 */
export function failNextCall(
  model: Prisma.ModelName | Uncapitalize<Prisma.ModelName>,
  method: string,
  error: Error,
): void {
  const key = (model.charAt(0).toLowerCase() + model.slice(1)) as keyof typeof prisma;
  const delegate = prisma[key] as unknown as Record<string, (...args: unknown[]) => unknown> | undefined;
  const original = delegate?.[method];
  if (!delegate || typeof original !== "function") {
    throw new Error(`failNextCall: prisma.${String(key)}.${method} is not a model method`);
  }
  let failed = false;
  delegate[method] = (...args: unknown[]) => {
    if (failed) return original(...args);
    failed = true;
    return Promise.reject(error);
  };
  failedCallRestores.push(() => {
    delegate[method] = original;
  });
}

export function restoreFailedCalls(): void {
  for (const restore of failedCallRestores.splice(0)) restore();
}

/** How long a race test waits to see the racing call blocked: well inside Prisma's 5 s interactive-transaction timeout of the held call. */
const LOCK_WAIT_CAP_MS = 3000;

/**
 * Resolves once another session of the test database is waiting on a lock,
 * or once `settled` (the racing call, when given) has settled; throws after
 * LOCK_WAIT_CAP_MS. `client` is a client of its own, so the check never waits
 * behind the held transaction or the racing call.
 */
export async function waitForLockWaitOr(client: PrismaClient, settled?: Promise<unknown>): Promise<void> {
  let done = false;
  settled?.then(
    () => (done = true),
    () => (done = true),
  );
  for (const start = Date.now(); Date.now() - start < LOCK_WAIT_CAP_MS; ) {
    const [{ waiting }] = await client.$queryRaw<Array<{ waiting: number }>>`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    if (waiting > 0 || done) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`The racing call neither waited on a lock nor finished within ${LOCK_WAIT_CAP_MS} ms`);
}
