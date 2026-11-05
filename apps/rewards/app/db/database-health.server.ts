/**
 * The database's readiness for /api/health, carried from apps/rewardspro's
 * utils/database-health.server.ts (probeDatabase only).
 */
import prisma from "~/db.server";

/**
 * Run `SELECT 1` and report whether it answered within `timeoutMs`.
 *
 * Never throws and never returns error detail, so callers can expose the
 * boolean publicly. Failures are logged by error name only.
 */
export async function probeDatabase(timeoutMs = 2000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("database probe timed out")), timeoutMs);
  });
  const query = prisma.$queryRaw`SELECT 1`.then(() => undefined);
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
