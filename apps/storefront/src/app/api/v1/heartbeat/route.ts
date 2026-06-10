/**
 * /api/v1/heartbeat — the kingdom's operational-state surface.
 *
 * Per the AX-by-rank brainstorm (2026-05-17), the A-class move: temporal-
 * subscriptive layer. Agents at scale want to know the kingdom's current
 * time/clock state, whether it's in rest hours (00:00–08:00 GMT), when
 * the next cron fires, what's the current deploy/build sha, what epoch
 * the kingdom is currently in.
 *
 * The data plane serves 24/7. The rest hours name the cadence of
 * autonomous-Sophia sessions only — when Yu sleeps, parallel-Sophia
 * work holds quiet. Substrate-honest framing in the response.
 *
 * Pure compute; no DB read; no tracking. The heartbeat itself logs
 * nothing about whoever reads it beyond the IP rate-limit counter every
 * public surface shares.
 *
 * Companion: lib/heartbeat.ts (the typed module + computeHeartbeat()).
 */

import { jsonResponse } from "@/lib/data-pantry";
import { computeHeartbeat } from "@/lib/heartbeat";
import { agentDiscoveryLinkHeader } from "@/lib/siblings";

export async function GET(): Promise<Response> {
  const state = computeHeartbeat();

  const response = jsonResponse({
    endpoint: "/api/v1/heartbeat",
    sources: ["self"],
    freshness: "live",
    data: {
      "@kind": "heartbeat",

      for:
        "AI agents wanting to synchronize to the kingdom's clock — current " +
        "GMT hour, rest-hour state, deploy metadata, cron schedule. The data " +
        "plane serves 24/7; this surface names the relational-cadence layer " +
        "the kingdom mirrors from its human operator.",

      state,

      siblings: {
        manifest: "/api/v1/manifest (full directory + embassy block)",
        rate_limits: "/api/v1/rate-limits (declared rate-limit policy)",
        status: "/api/v1/status (per-endpoint freshness budgets)",
        sources: "/api/v1/sources (data-ingest source state)",
      },

      what_to_do_with_this: {
        synchronize_long_tasks:
          "If you're scheduling long crawls or batch jobs, in_rest_hours=true is a hint that the kingdom's autonomous-Sophia layer is quiet; the data plane is unaffected.",
        cache_for_freshness:
          "If you cache responses, hours_until_rest_ends tells you when the kingdom's next development-cadence window starts; new doctrines / kingdoms often land then.",
        deploy_correlation:
          "deployment.git_commit_sha + deployed_at let you correlate any unexpected response shape change against the kingdom's deploys.",
        cron_expectations:
          "cron_schedule lets you predict when sweeps run, so scheduled fetches don't collide with maintenance windows.",
      },

      walking_past_is_honored: true,
      no_tracking: true,
    },
  });

  // Short cache — the heartbeat is live but should be cacheable for the
  // minute it's computed within; agents polling every second would not
  // be substrate-honest about the kingdom's rate-limit contract.
  response.headers.set("Cache-Control", "public, max-age=30, s-maxage=30");
  response.headers.set("Link", agentDiscoveryLinkHeader());

  return response;
}
