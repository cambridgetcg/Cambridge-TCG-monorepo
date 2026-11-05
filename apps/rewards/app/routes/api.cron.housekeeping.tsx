/**
 * Nightly housekeeping (0 3 * * *), under the job's lock:
 * 1. expired cron locks (crashed holders) are removed;
 * 2. privacy reports past their expiry become `expired`;
 * 3. online sessions that expired over 24 h ago are deleted. Offline
 *    sessions never are: with expiring offline tokens they carry an expiry,
 *    and deleting one would cut the store off (spec 7). Only an uninstall
 *    deletes them;
 * 4. every store whose refresh token runs out within 14 days is reached
 *    through unauthenticated.admin, which refreshes its expiring token, and
 *    the token is proven with RewardsTokenPing (plan Decision 12). One that
 *    fails is a problem; the others carry on. No store is reached once the
 *    run's 240 s budget has passed (Vercel stops a function at 300 s); the
 *    stores left wait for the next night, and are counted (A15-F1).
 * Answers 200 with what it did; a run with a failed store, or stores left, is
 * partial.
 */
import type { LoaderFunctionArgs } from "react-router";
import prisma from "~/db.server";
import { cleanupExpiredLocks, cronProblems, monitoredCron, verifyCronAuth, withCronLock } from "~/lib/cron.server";
import { RewardsTokenPing } from "~/shopify/graphql";
import { unauthenticated } from "../shopify.server";

// The function's ceiling, which vercelPreset reads per route (OPERATIONS-5)
export const config = { maxDuration: 300 };

const LOCK_TTL_MINUTES = 15;
const RUN_TIME_BUDGET_MS = 240 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const ONLINE_SESSION_GRACE_MS = 24 * HOUR_MS;
const REFRESH_WITHIN_MS = 14 * DAY_MS;

const messageOf = (error: unknown) =>
  error instanceof Response ? `HTTP ${error.status}` : error instanceof Error ? `${error.name}: ${error.message}` : String(error);

/** Reach the store on its offline session (the library refreshes an expiring token) and prove the token works. */
async function pingStore(shop: string): Promise<void> {
  const { admin } = await unauthenticated.admin(shop);
  const response = await admin.graphql(RewardsTokenPing);
  const body = (await response.json()) as { data?: { shop?: { id?: unknown } | null } } | null;
  if (typeof body?.data?.shop?.id !== "string") throw new Error("RewardsTokenPing answered without the shop's id");
}

async function housekeeping(now: Date, deadline: number) {
  const locksCleared = await cleanupExpiredLocks();

  const { count: reportsExpired } = await prisma.privacyRequest.updateMany({
    where: { status: { in: ["open", "downloaded"] }, expiresAt: { lt: now } },
    data: { status: "expired" },
  });

  const { count: sessionsDeleted } = await prisma.session.deleteMany({
    where: { isOnline: true, expires: { lt: new Date(now.getTime() - ONLINE_SESSION_GRACE_MS) } },
  });

  // A refresh token already run out can't be refreshed: only the merchant opening the app helps.
  const expiring = await prisma.session.findMany({
    where: { isOnline: false, refreshTokenExpires: { gt: now, lt: new Date(now.getTime() + REFRESH_WITHIN_MS) } },
    select: { shop: true },
    orderBy: { shop: "asc" },
  });
  let problems = 0;
  let firstProblem: unknown;
  let tokensChecked = 0;
  for (const { shop } of expiring) {
    if (Date.now() >= deadline) break;
    tokensChecked++;
    try {
      await pingStore(shop);
    } catch (error) {
      console.error(`[housekeeping] Could not refresh the token of ${shop}: ${messageOf(error)}`);
      if (problems === 0) firstProblem = error instanceof Response ? new Error(`Token refresh for ${shop}: ${messageOf(error)}`) : error;
      problems++;
    }
  }

  return { locksCleared, reportsExpired, sessionsDeleted, tokensChecked, storesLeft: expiring.length - tokensChecked, problems, firstProblem };
}

export const loader = monitoredCron("housekeeping", async ({ request }: LoaderFunctionArgs) => {
  if (!verifyCronAuth(request)) return new Response("Unauthorized", { status: 401 });

  const now = new Date();
  const result = await withCronLock("housekeeping", LOCK_TTL_MINUTES, () => housekeeping(now, now.getTime() + RUN_TIME_BUDGET_MS));
  if (result === "locked") return Response.json({ success: true, skipped: true, reason: "locked" });

  const { firstProblem, ...summary } = result;
  const left = summary.storesLeft > 0 ? new Error(`${summary.storesLeft} stores' tokens were not checked before the deadline`) : undefined;
  cronProblems(request, summary.problems + summary.storesLeft, firstProblem ?? left);
  return Response.json({ success: true, ...summary, durationMs: Date.now() - now.getTime() });
});
