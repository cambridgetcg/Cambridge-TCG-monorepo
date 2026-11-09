import { Prisma } from "@prisma/client";
import prisma, { databaseSchema } from "~/db.server";

const testDatabaseUrl = process.env.REWARDSPRO_TEST_DATABASE_URL?.trim();

/**
 * True only when env.ts (vitest.postgres.config.ts) has pointed the app's
 * client at the loopback test database. Under any other config DATABASE_URL
 * may name a real database, so these suites skip rather than truncate it.
 */
export const hasTestDatabase = Boolean(testDatabaseUrl) && process.env.DATABASE_URL === testDatabaseUrl;

/** Empty every table in the app schema except Prisma's migration ledger. */
export async function resetDatabase(): Promise<void> {
  if (!hasTestDatabase) {
    throw new Error("resetDatabase runs only against REWARDSPRO_TEST_DATABASE_URL (vitest.postgres.config.ts)");
  }
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename::text AS tablename FROM pg_tables
    WHERE schemaname = ${databaseSchema} AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const names = tables.map(({ tablename }) => `"${databaseSchema}"."${tablename}"`).join(", ");
  await prisma.$executeRaw`TRUNCATE ${Prisma.raw(names)} RESTART IDENTITY CASCADE`;
}

const failedCallRestores: Array<() => void> = [];

/**
 * Make the next call of one Prisma model method reject with `error`, as a
 * dropped pooled connection would. vi.spyOn can't do this: its restore leaves
 * the client's model method undefined. Undo with restoreFailedCalls().
 */
export function failNextCall(model: "order" | "customerTierState" | "shopSettings", method: string, error: Error): void {
  const delegate = prisma[model] as unknown as Record<string, (...args: unknown[]) => unknown>;
  const original = delegate[method];
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
