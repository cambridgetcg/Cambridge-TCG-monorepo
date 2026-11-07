/**
 * The database's readiness for /api/health, carried from apps/rewardspro's
 * utils/database-health.server.ts (probeDatabase only), reading one of the
 * app's own tables instead of `SELECT 1` (READINESS-3).
 */
import prisma from "~/db.server";

/**
 * Read one row id of the app's own cron_lock table (empty-safe) and report
 * whether it answered within `timeoutMs`. That proves the URL's schema and
 * the role's grants, not only the host: a database URL with the right host
 * but the wrong schema or role answers `SELECT 1` yet fails every webhook.
 *
 * Never throws and never returns error detail, so callers can expose the
 * boolean publicly. Failures are logged by error name only.
 */
export async function probeDatabase(timeoutMs = 2000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("database probe timed out")), timeoutMs);
  });
  const query = prisma.cronLock.findFirst({ select: { id: true } }).then(() => undefined);
  // If the timeout wins, a later failure of the query must not go unhandled.
  query.catch(() => undefined);
  try {
    await Promise.race([query, timeout]);
    return true;
  } catch (error) {
    console.error("[DatabaseHealth] Probe failed", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return false;
  } finally {
    clearTimeout(timer);
  }
}
