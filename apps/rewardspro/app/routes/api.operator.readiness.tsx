import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { probeDatabase } from "~/utils/database-health.server";
import { verifyCronAuth } from "~/utils/cron-auth.server";
import { cronHealth } from "~/services/cron-monitor.server";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Authenticated dependency-readiness check for operators.
 *
 * Runs the same bounded `SELECT 1` probe as public `/api/health`, behind the
 * cron bearer credential, then reads the scheduled crons' run records
 * (services/cron-monitor.server.ts). It answers 503 `crons_stale` when a cron
 * hasn't finished a run within twice its schedule and 15 minutes, so an
 * uptime check pointed here notices a cron that fails or stops. It never
 * returns configuration or error detail: only each cron's schedule and the
 * times of its last start, success, partial run, failure and stop report.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  if (!verifyCronAuth(request)) {
    return json(
      { status: "unauthorized" },
      { status: 401, headers: PRIVATE_NO_STORE },
    );
  }

  const unavailable = () =>
    json({ status: "unavailable" }, { status: 503, headers: PRIVATE_NO_STORE });

  if (!(await probeDatabase())) return unavailable();

  let crons: Awaited<ReturnType<typeof cronHealth>>;
  try {
    crons = await cronHealth();
  } catch (error) {
    console.error("[Readiness] Could not read the cron records:", error);
    return unavailable();
  }

  if (crons.stale.length > 0) {
    return json({ status: "crons_stale", crons }, { status: 503, headers: PRIVATE_NO_STORE });
  }
  return json({ status: "ready", crons }, { headers: PRIVATE_NO_STORE });
}
