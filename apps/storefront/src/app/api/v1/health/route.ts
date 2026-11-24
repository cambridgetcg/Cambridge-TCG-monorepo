/**
 * /api/v1/health — whether the site can do its work now, from one query:
 * does the database answer, and did each scheduled job run when it should.
 *
 * 200 with status ok or degraded when the database answered; 503 when it did
 * not within five seconds. Nothing here is a constant and nothing is cached.
 * Read by programs deciding whether to try again, by the guest walk
 * (lib/guest-walk.ts) and by .github/scripts/deploy-health.py.
 */

import { errorResponse, jsonResponse } from "@/lib/data-pantry";
import { readHealth, within, type Health } from "@/lib/observability/job-health";

export const dynamic = "force-dynamic";

const ENDPOINT = "/api/v1/health";

async function answered(): Promise<Health | null> {
  try {
    return await within(5_000, (async () => readHealth((await import("@/lib/db")).query))());
  } catch (error) {
    console.error("[ops/health] the database did not answer:", error instanceof Error ? error.name : "UnknownError");
    return null;
  }
}

export async function GET(): Promise<Response> {
  const health = await answered();
  if (!health) {
    return errorResponse({
      code: "SOURCE_UNAVAILABLE",
      message: "The site is running, but its database did not answer. Wait five minutes before trying again.",
      endpoint: ENDPOINT,
      details: { status: "down", recommendation: "wait-300s", database: { answered: false } },
    });
  }
  const behind = health.jobs.filter((job) => job.state === "late" || job.state === "failing");
  return jsonResponse({
    endpoint: ENDPOINT,
    sources: ["self"],
    source_license: ["cc0"],
    license: "CC0-1.0",
    freshness: "live",
    no_cache: true,
    contains_self: true,
    data: {
      "@kind": "health",
      status: behind.length ? "degraded" : "ok",
      recommendation: "retry-with-backoff",
      recommendation_rationale: behind.length
        ? "The database answers. Some scheduled jobs are behind, so what they collect may be older than usual."
        : "The database answers and the scheduled jobs are on time. If a request failed, check it with /api/v1/echo, then try again after a short wait.",
      as_of: health.clock,
      database: { answered: true, clock: health.clock },
      jobs: health.jobs,
      daily_check: health.daily_check,
    },
    does_not_include: [
      "a service guarantee",
      "each price source's own state, which is at /api/v1/sources",
    ],
  });
}
