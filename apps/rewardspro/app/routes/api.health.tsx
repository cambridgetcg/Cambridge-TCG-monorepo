/**
 * Public health check: process liveness plus database readiness.
 *
 * Answers 200 only when the database answered a bounded `SELECT 1`, and 503
 * otherwise, so an outage is visible to uptime checks. It never inspects the
 * request and never returns configuration or error detail. One probe result
 * is shared for a few seconds per instance, so public traffic cannot turn
 * into database load.
 */

import { json } from "@remix-run/node";
import { probeDatabase } from "~/utils/database-health.server";

const PROBE_REUSE_MS = 5_000;
let lastProbe: { startedAt: number; ready: Promise<boolean> } | null = null;

export async function loader() {
  const now = Date.now();
  if (!lastProbe || now - lastProbe.startedAt > PROBE_REUSE_MS) {
    lastProbe = { startedAt: now, ready: probeDatabase() };
  }
  const ready = await lastProbe.ready;

  return json(
    ready
      ? { status: "ok", database: "ready" }
      : { status: "unavailable", database: "unavailable" },
    {
      status: ready ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
