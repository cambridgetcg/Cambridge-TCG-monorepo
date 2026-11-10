/**
 * The database's readiness for /api/health, carried from apps/rewardspro's
 * utils/database-health.server.ts (probeDatabase only), reading the app's
 * own tables instead of `SELECT 1` (READINESS-3).
 */
import prisma from "~/db.server";

/**
 * Read one row id of the app's own cron_lock table, then one full row each
 * of connection, merchant and refund, and report whether all four answered
 * within `timeoutMs`.
 *
 * cron_lock proves the URL's schema and the role's grants, not only the
 * host: a database URL with the right host but the wrong schema or role
 * answers `SELECT 1` yet fails every webhook. The full rows select every
 * column Prisma knows: connection and merchant as findConnection does on
 * every webhook, proxy call, admin page and sweep, and refund as the
 * refunds webhook and the buyer's data report do (RP-25). Postgres resolves
 * columns when it plans the query, so a column the code knows and the
 * database lacks fails even on an empty table: code deployed before its
 * migration on one of these three tables turns health red. A column missing
 * from any other table doesn't show here; the production build's migration
 * check (scripts/check-production-migrations.ts) covers every migration.
 * They are separate reads, not findConnection's include, which reads
 * merchant only when a connection row exists. The reads run one after
 * another, so the probe holds one pooled connection, and none is sent after
 * the timeout.
 *
 * Never throws and never returns error detail, so callers can expose the
 * boolean publicly. Failures are logged by error name and code only: the
 * message and meta name the column.
 */
export async function probeDatabase(timeoutMs = 2000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error("database probe timed out"));
    }, timeoutMs);
  });
  const query = (async () => {
    await prisma.cronLock.findFirst({ select: { id: true } });
    if (timedOut) return;
    await prisma.connection.findFirst();
    if (timedOut) return;
    await prisma.merchant.findFirst();
    if (timedOut) return;
    await prisma.refund.findFirst();
  })();
  // If the timeout wins, a later failure of the query must not go unhandled.
  query.catch(() => undefined);
  try {
    await Promise.race([query, timeout]);
    return true;
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    console.error("[DatabaseHealth] Probe failed", {
      name: error instanceof Error ? error.name : "unknown",
      ...(typeof code === "string" ? { code } : {}),
    });
    return false;
  } finally {
    clearTimeout(timer);
  }
}
