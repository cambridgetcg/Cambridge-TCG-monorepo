/**
 * The hourly payout check (30 * * * *, spec 6.3 rules 9 and 13): settle
 * unclear payouts, send due ones and record missed paid orders
 * (runPayoutCheck), under the job's lock, within 240 s of the start (Vercel
 * stops a function at 300 s; what is left waits for the next hour).
 * Answers 200 with a summary; a run with failed stores, payouts or orders is
 * recorded as partial.
 */
import type { LoaderFunctionArgs } from "react-router";
import { cronProblems, monitoredCron, verifyCronAuth, withCronLock } from "~/lib/cron.server";
import { runPayoutCheck } from "~/lib/payout-check.server";
import { railFor } from "~/shopify/rail-for.server";

const LOCK_TTL_MINUTES = 15;
const RUN_TIME_BUDGET_MS = 240 * 1000;

export const loader = monitoredCron("payouts", async ({ request }: LoaderFunctionArgs) => {
  if (!verifyCronAuth(request)) return new Response("Unauthorized", { status: 401 });

  const now = new Date();
  const result = await withCronLock("payouts", LOCK_TTL_MINUTES, () =>
    runPayoutCheck({ now, railFor, deadline: now.getTime() + RUN_TIME_BUDGET_MS }),
  );
  if (result === "locked") return Response.json({ success: true, skipped: true, reason: "locked" });

  const { firstProblem, ...summary } = result;
  cronProblems(request, summary.problems, firstProblem);
  return Response.json({ success: true, ...summary, durationMs: Date.now() - now.getTime() });
});
