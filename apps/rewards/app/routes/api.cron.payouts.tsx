/**
 * The hourly payout check (30 * * * *, spec 6.3 rules 9 and 13): settle
 * unclear payouts, send due ones and record missed paid orders
 * (runPayoutCheck), under the job's lock, within 240 s of the start (Vercel
 * stops a function at 300 s; what is left waits for the next hour).
 * Then, in the time left, it polls every running past-orders import
 * (pollRunningImports, plan Decision 13: the import's backstop).
 * Answers 200 with a summary; a run with failed stores, payouts, orders or
 * import polls is recorded as partial.
 */
import type { LoaderFunctionArgs } from "react-router";
import { cronProblems, monitoredCron, verifyCronAuth, withCronLock } from "~/lib/cron.server";
import { runPayoutCheck } from "~/lib/payout-check.server";
import { pollRunningImports } from "~/shopify/bulk-import.server";
import { railFor } from "~/shopify/rail-for.server";

// The function's ceiling, which vercelPreset reads per route (OPERATIONS-5);
// the run's budget below leaves a minute of it.
export const config = { maxDuration: 300 };

const LOCK_TTL_MINUTES = 15;
const RUN_TIME_BUDGET_MS = 240 * 1000;

export const loader = monitoredCron("payouts", async ({ request }: LoaderFunctionArgs) => {
  if (!verifyCronAuth(request)) return new Response("Unauthorized", { status: 401 });

  const now = new Date();
  const deadline = now.getTime() + RUN_TIME_BUDGET_MS;
  const result = await withCronLock("payouts", LOCK_TTL_MINUTES, async () => {
    const check = await runPayoutCheck({ now, railFor, deadline });
    const imports = await pollRunningImports(deadline);
    return {
      ...check,
      problems: check.problems + imports.failed,
      firstProblem: check.problems > 0 ? check.firstProblem : imports.firstProblem,
      importsPolled: imports.polled,
      importsFailed: imports.failed,
    };
  });
  if (result === "locked") return Response.json({ success: true, skipped: true, reason: "locked" });

  const { firstProblem, ...summary } = result;
  cronProblems(request, summary.problems, firstProblem);
  return Response.json({ success: true, ...summary, durationMs: Date.now() - now.getTime() });
});
