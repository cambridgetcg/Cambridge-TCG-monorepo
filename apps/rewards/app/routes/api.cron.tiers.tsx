/**
 * The nightly tier pass (0 2 * * *, rule 10), carried from apps/rewardspro's
 * api.cron.tier-recalculation.tsx: every active store, the one that waited
 * longest first, has its buyers' tiers resolved by runTierPass. Each store
 * gets an equal share of the time left (time one doesn't use goes to the
 * stores after it), so a big store can't hold up the others, and no store
 * starts after the 240 s budget (Vercel stops a function at 300 s). A pass
 * can span several runs: buyers resolved since the store's pass began are
 * up to date, so the next run carries on where this one stopped.
 *
 * A store's lastTierPassAt is stamped only when its pass is complete with no
 * errors. The run answers 500, so the monitor reports it, when a buyer could
 * not be resolved or a store has had no complete pass for over 2 days
 * (counted from its reinstall when that came later, so a store back after a
 * long absence isn't overdue on its first night).
 */
import type { LoaderFunctionArgs } from "react-router";
import prisma from "~/db.server";
import { cronFailed, monitoredCron, verifyCronAuth, withCronLock } from "~/lib/cron.server";
import { runTierPass } from "~/lib/tiers.server";

const LOCK_TTL_MINUTES = 30;
const RUN_TIME_BUDGET_MS = 240 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// The job runs at the same time each night and a pass is stamped a little
// after it, so a day later slightly less than a day has passed (the carried
// DUE_SLACK_MS)
const DUE_SLACK_MS = HOUR_MS;
const OVERDUE_MS = 2 * DAY_MS;

/**
 * Buyers resolved at or after this are up to date for the pass: the store
 * became due a day after its last complete pass (a store with none, a day
 * ago), less the slack; or later, when the merchant asked for a pass (a tier
 * change) after that.
 */
function resolvedBefore(now: Date, lastTierPassAt: Date | null, tierPassRequestedAt: Date | null): Date {
  const due = (lastTierPassAt?.getTime() ?? now.getTime() - DAY_MS) + DAY_MS - DUE_SLACK_MS;
  return new Date(Math.max(due, tierPassRequestedAt?.getTime() ?? 0));
}

async function tierPasses(now: Date, deadline: number) {
  const connections = await prisma.connection.findMany({
    where: { status: "active" },
    orderBy: [{ lastTierPassAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
    select: { id: true, externalAccountId: true, activatedAt: true, lastTierPassAt: true, tierPassRequestedAt: true },
  });
  const summary = { stores: connections.length, complete: 0, unfinished: 0, processed: 0, changed: 0, errors: 0, overdue: [] as string[] };
  let firstProblem: unknown;

  for (const [index, connection] of connections.entries()) {
    const shop = connection.externalAccountId;
    let stamped = false;
    try {
      const start = Date.now();
      if (start >= deadline) {
        summary.unfinished++;
        continue;
      }
      const pass = await runTierPass(connection.id, {
        deadline: start + (deadline - start) / (connections.length - index),
        resolvedBefore: resolvedBefore(now, connection.lastTierPassAt, connection.tierPassRequestedAt),
      });
      summary.processed += pass.processed;
      summary.changed += pass.changed;
      summary.errors += pass.errors;
      if (pass.errors > 0) firstProblem ??= pass.firstError ?? new Error(`${pass.errors} buyers' tiers could not be resolved in ${shop}`);
      if (!pass.complete) summary.unfinished++;
      if (pass.complete && pass.errors === 0) {
        await prisma.connection.update({ where: { id: connection.id }, data: { lastTierPassAt: new Date() } });
        stamped = true;
        summary.complete++;
      }
    } catch (error) {
      console.error(`[tiers] The tier pass of ${shop} failed:`, error instanceof Error ? error.message : String(error));
      summary.errors++;
      firstProblem ??= error;
    } finally {
      // Measured from the later of its last complete pass and its (re)install
      const since = Math.max(connection.lastTierPassAt?.getTime() ?? 0, connection.activatedAt.getTime());
      if (!stamped && now.getTime() - since > OVERDUE_MS) summary.overdue.push(shop);
    }
  }
  return { summary, firstProblem };
}

export const loader = monitoredCron("tiers", async ({ request }: LoaderFunctionArgs) => {
  if (!verifyCronAuth(request)) return new Response("Unauthorized", { status: 401 });

  const now = new Date();
  const result = await withCronLock("tiers", LOCK_TTL_MINUTES, () => tierPasses(now, now.getTime() + RUN_TIME_BUDGET_MS));
  if (result === "locked") return Response.json({ success: true, skipped: true, reason: "locked" });

  const { summary, firstProblem } = result;
  const failed = summary.errors > 0 || summary.overdue.length > 0;
  if (failed) {
    cronFailed(request, firstProblem ?? new Error(`${summary.overdue.length} stores overdue for a tier pass: ${summary.overdue.join(", ")}`));
  }
  return Response.json({ success: !failed, ...summary, durationMs: Date.now() - now.getTime() }, { status: failed ? 500 : 200 });
});
