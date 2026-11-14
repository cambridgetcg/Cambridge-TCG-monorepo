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
 *    stores left wait for the next night, and are counted (A15-F1);
 * 5. every store still uninstalled more than 30 days after its uninstall is
 *    erased through eraseMerchant (Ruling 86, SECURITY-3): the erasure its
 *    shop/redact owed, whose delivery may have failed every retry. It locks
 *    the connection and skips a store that is active again (Ruling 41). One
 *    that fails is a problem; the same budget applies, and the stores left
 *    are counted;
 * 6. every active store's widget settings (cashback on or off, the base
 *    rate) are written again to its app-data metafield (syncWidgetConfig,
 *    plan Decision 8), so a change whose write failed is put right within a
 *    day. The stores tried longest ago come first (never-tried ones first
 *    of all), so a run the budget cuts short leaves different stores each
 *    night and a store that keeps failing goes to the back (M3e-F2), and a
 *    store whose last write carried today's value and is under a week old is
 *    skipped as unchanged (OPERATIONS-4). A store that can't be reached or that Shopify refuses
 *    is a problem; the same budget applies, and the stores left are counted;
 * 7. every store whose past-orders import failed, installed within the last
 *    30 days, is tried again through retryFailedImport, once a night, the
 *    store tried longest ago first (never-tried ones first of all), so a run
 *    the budget cuts short leaves different stores each night: an import that
 *    failed while Shopify refused bulk queries runs once it lets them
 *    through. It comes after the widget settings, so it never takes their
 *    budget. A try Shopify doesn't start (it refuses the query, answers with
 *    an error, or doesn't answer in time) is logged as a warning and is no
 *    problem: the failure was reported when the import failed, and one alert
 *    a night would add nothing. A store whose session can't be loaded is a
 *    problem, as in the steps above; the same budget applies, and the stores
 *    left are counted.
 * A store whose token another call is renewing right now is skipped for
 * this run, as no problem (Ruling 85: no second renewal beside it); each
 * step it skips is counted in busySkips.
 * Answers 200 with what it did; a run with a failed store, or stores left, is
 * partial, and its message names every kind of store left (A19-F8).
 */
import type { LoaderFunctionArgs } from "react-router";
import prisma from "~/db.server";
import { cleanupExpiredLocks, cronProblems, monitoredCron, verifyCronAuth, withCronLock } from "~/lib/cron.server";
import { eraseMerchant } from "~/lib/erasure.server";
import { findConnection } from "~/lib/merchant.server";
import { importRetryDue, retryFailedImport } from "~/shopify/bulk-import.server";
import { RewardsTokenPing } from "~/shopify/graphql";
import { RenewalBusyError } from "~/shopify/renewal-busy";
import { syncWidgetConfig, widgetConfigCurrent } from "~/shopify/widget-config.server";
import { unauthenticated } from "../shopify.server";

// The function's ceiling, which vercelPreset reads per route (OPERATIONS-5)
export const config = { maxDuration: 300 };

const LOCK_TTL_MINUTES = 15;
const RUN_TIME_BUDGET_MS = 240 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const ONLINE_SESSION_GRACE_MS = 24 * HOUR_MS;
const REFRESH_WITHIN_MS = 14 * DAY_MS;
/** Well past Shopify's 48 hours to shop/redact, and its retries (Ruling 86). */
const ERASE_AFTER_MS = 30 * DAY_MS;

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
  let busySkips = 0;
  /** True for a store another call is renewing the token of: left for the next run (Ruling 85). */
  const busy = (error: unknown, shop: string, what: string) => {
    if (!(error instanceof RenewalBusyError)) return false;
    console.warn(`[housekeeping] Another renewal of ${shop}'s token is running; ${what} for the next run`);
    busySkips++;
    return true;
  };
  let tokensChecked = 0;
  for (const { shop } of expiring) {
    if (Date.now() >= deadline) break;
    tokensChecked++;
    try {
      await pingStore(shop);
    } catch (error) {
      if (busy(error, shop, "its token check waits")) continue;
      console.error(`[housekeeping] Could not refresh the token of ${shop}: ${messageOf(error)}`);
      if (problems === 0) firstProblem = error instanceof Response ? new Error(`Token refresh for ${shop}: ${messageOf(error)}`) : error;
      problems++;
    }
  }

  // Owed erasures, oldest uninstall first (Ruling 86)
  const owed = await prisma.connection.findMany({
    where: { status: "uninstalled", uninstalledAt: { lt: new Date(now.getTime() - ERASE_AFTER_MS) } },
    select: { externalAccountId: true },
    orderBy: [{ uninstalledAt: "asc" }, { externalAccountId: "asc" }],
  });
  let erasuresTried = 0;
  let storesErased = 0;
  for (const { externalAccountId: shop } of owed) {
    if (Date.now() >= deadline) break;
    erasuresTried++;
    try {
      const erased = await eraseMerchant(shop);
      if (erased.status === "erased") {
        storesErased++;
        console.log(`[housekeeping] Erased ${shop}, uninstalled over 30 days ago with no shop/redact done`);
      }
    } catch (error) {
      console.error(`[housekeeping] Could not erase ${shop}, uninstalled over 30 days ago: ${messageOf(error)}`);
      if (problems === 0) firstProblem = error;
      problems++;
    }
  }

  // Tried longest ago first, never-tried ones first of all (OPERATIONS-4, M3e-F2)
  const active = await prisma.connection.findMany({
    where: { status: "active" },
    select: { externalAccountId: true, widgetConfigSyncedAt: true, widgetConfigValue: true },
    orderBy: [{ widgetConfigTriedAt: { sort: "asc", nulls: "first" } }, { externalAccountId: "asc" }],
  });
  let widgetsChecked = 0;
  let widgetsUnchanged = 0;
  for (const { externalAccountId: shop, ...record } of active) {
    if (Date.now() >= deadline) break;
    widgetsChecked++;
    try {
      const conn = await findConnection(shop);
      // Uninstalled since the list was read: nothing to write
      if (!conn) continue;
      if (await widgetConfigCurrent(conn.merchantId, record, new Date())) {
        widgetsUnchanged++;
        continue;
      }
      const { admin } = await unauthenticated.admin(shop);
      await syncWidgetConfig(admin, conn);
    } catch (error) {
      if (busy(error, shop, "its widget settings wait")) continue;
      console.error(`[housekeeping] Could not write the widget settings of ${shop}: ${messageOf(error)}`);
      if (problems === 0) firstProblem = error instanceof Response ? new Error(`Widget settings for ${shop}: ${messageOf(error)}`) : error;
      problems++;
    }
  }

  // Failed past-orders imports, once a night, tried longest ago first (retryFailedImport)
  const failedImports = await prisma.connection.findMany({
    where: importRetryDue(now),
    select: { id: true, externalAccountId: true },
    orderBy: [{ importLaunchedAt: { sort: "asc", nulls: "first" } }, { externalAccountId: "asc" }],
  });
  let importsTried = 0;
  let importsStarted = 0;
  for (const { id, externalAccountId: shop } of failedImports) {
    if (Date.now() >= deadline) break;
    importsTried++;
    try {
      const { admin } = await unauthenticated.admin(shop);
      const outcome = await retryFailedImport(admin, id, now);
      if (outcome === "started") {
        importsStarted++;
        console.log(`[housekeeping] Started the failed past-orders import of ${shop} again`);
      } else if (outcome === "still_failed") {
        console.warn(`[housekeeping] Shopify did not start the past-orders import of ${shop}; it is tried again tomorrow`);
      }
    } catch (error) {
      if (busy(error, shop, "its past-orders import waits")) continue;
      console.error(`[housekeeping] Could not try the past-orders import of ${shop} again: ${messageOf(error)}`);
      if (problems === 0) firstProblem = error instanceof Response ? new Error(`Past-orders import for ${shop}: ${messageOf(error)}`) : error;
      problems++;
    }
  }

  return {
    locksCleared,
    reportsExpired,
    sessionsDeleted,
    tokensChecked,
    storesLeft: expiring.length - tokensChecked,
    storesErased,
    erasuresLeft: owed.length - erasuresTried,
    widgetsChecked,
    widgetsUnchanged,
    widgetsLeft: active.length - widgetsChecked,
    importsTried,
    importsStarted,
    importsLeft: failedImports.length - importsTried,
    busySkips,
    problems,
    firstProblem,
  };
}

export const loader = monitoredCron("housekeeping", async ({ request }: LoaderFunctionArgs) => {
  if (!verifyCronAuth(request)) return new Response("Unauthorized", { status: 401 });

  const now = new Date();
  const result = await withCronLock("housekeeping", LOCK_TTL_MINUTES, () => housekeeping(now, now.getTime() + RUN_TIME_BUDGET_MS));
  if (result === "locked") return Response.json({ success: true, skipped: true, reason: "locked" });

  const { firstProblem, ...summary } = result;
  // Every kind of store the deadline left, by name (A19-F8)
  const kindsLeft = [
    summary.storesLeft > 0 ? `${summary.storesLeft} stores' tokens were not checked` : null,
    summary.erasuresLeft > 0 ? `${summary.erasuresLeft} uninstalled stores were not erased` : null,
    summary.widgetsLeft > 0 ? `${summary.widgetsLeft} stores' widget settings were not written` : null,
    summary.importsLeft > 0 ? `${summary.importsLeft} stores' failed past-orders imports were not tried again` : null,
  ].filter((kind) => kind !== null);
  const left = kindsLeft.length > 0 ? new Error(`${kindsLeft.join(" and ")} before the deadline`) : undefined;
  cronProblems(request, summary.problems + summary.storesLeft + summary.erasuresLeft + summary.widgetsLeft + summary.importsLeft, firstProblem ?? left);
  return Response.json({ success: true, ...summary, durationMs: Date.now() - now.getTime() });
});
