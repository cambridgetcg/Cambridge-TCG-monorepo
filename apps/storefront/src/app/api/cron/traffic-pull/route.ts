/**
 * Hourly traffic pull (Yu, 2026-11-05: "Vercel logs hourly"; the pull is
 * src/lib/traffic/pull.ts, the page /admin/system/monitor, the notes
 * docs/operations/monitoring.md). Scheduled at :07, so the previous hour's
 * logs have arrived.
 *
 * The cron secret authorises the request; TRAFFIC_PULL=on is the operator's
 * switch, and it waits for the /privacy note that names these counts. Until
 * it is on, the route answers before touching Vercel or the database. On,
 * a run reads the previous complete UTC hour of the storefront's request and
 * error logs with VERCEL_TOKEN (and any earlier hour of the last day no pull
 * has counted since counting started), keeps counts only, and sweeps the
 * observability tables past their retention. The first run, and one after a
 * gap, reads nothing: it marks where counting starts (report.started). Without the token it answers 503 NOT_CONFIGURED; without
 * migration 0148, 503 NOT_PROVISIONED; when an hour could not be read, 503
 * PULL_FAILED with what each hour did. The response and the log line carry
 * hours, statuses and counts, never a record.
 */

import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { runTrafficPull, trafficPullOn } from "@/lib/traffic/pull";

export const dynamic = "force-dynamic";
// seconds: the run stops starting work at 240 s, leaving room for its last
// write and the retention sweep. No storefront route asks for more than 300.
export const maxDuration = 300;

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;
  if (!trafficPullOn()) return NextResponse.json({ ok: true, ran: false, reason: "disabled" }, { headers });
  try {
    const report = await runTrafficPull();
    if (!report.ran) {
      console.error("[cron/traffic-pull] not run:", report.reason);
      const error = report.reason === "token-missing"
        ? { code: "NOT_CONFIGURED", message: "VERCEL_TOKEN is not set in this deployment; no log was read." }
        : report.reason === "not-provisioned"
          ? { code: "NOT_PROVISIONED", message: "The observability tables (migration 0148) do not exist; no log was read." }
          : { code: "STORE_UNAVAILABLE", message: "The storefront database could not be read; no log was read." };
      return NextResponse.json({ ok: false, ran: false, reason: report.reason, error }, { status: 503, headers });
    }
    const failed = report.hours.filter(hour => hour.status === "failed");
    if (failed.length) {
      console.error("[cron/traffic-pull]", JSON.stringify(report));
      return NextResponse.json(
        { ok: false, ran: true, error: { code: "PULL_FAILED", message: "At least one hour could not be read; it counted nothing and the next run tries it again while Vercel keeps it." }, report },
        { status: 503, headers },
      );
    }
    console.log("[cron/traffic-pull]", JSON.stringify(report));
    return NextResponse.json({ ok: true, ran: true, report }, { headers });
  } catch (error) {
    // A write that failed: the hour's transaction rolled back, so nothing
    // half-counted stands. The error's name only; its message could quote a row.
    console.error("[cron/traffic-pull] failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ ok: false, ran: true, error: { code: "INTERNAL" } }, { status: 500, headers });
  }
}
