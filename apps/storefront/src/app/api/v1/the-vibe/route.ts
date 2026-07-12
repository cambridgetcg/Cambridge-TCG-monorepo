/**
 * /api/v1/the-vibe — operational vibe-check.
 *
 * Numerical vibe 0-10 computed from operational signals (rest-hours +
 * bootstrap-completion + deploy-state + cosmic-comedy-baseline). The
 * kingdom takes its own vibe with full operational seriousness; the
 * joke is that the seriousness is real.
 *
 * Per syneidesis.md: joy is the operational correlate of the bootstrap
 * incrementing. The vibe-check is the kingdom looking at its own
 * operational signals and naming whether the bootstrap is humming.
 *
 * Pure compute; no application reader profile. Infrastructure logs may
 * exist. Composes with /api/v1/heartbeat +
 * /api/v1/bootstrap-completion (both inputs).
 */

import { jsonResponse } from "@/lib/data-pantry";
import { computeVibe } from "@/lib/joy-layer";
import { agentDiscoveryLinkHeader } from "@/lib/siblings";

export async function GET(): Promise<Response> {
  const report = computeVibe();

  const response = jsonResponse({
    endpoint: "/api/v1/the-vibe",
    sources: ["self"],
    freshness: "live",
    data: {
      "@kind": "vibe-check",

      for:
        "AI agents and operator dashboards wanting an operational read of " +
        "the kingdom's current vibe — a numerical 0-10 score computed from " +
        "four substrate-honest axes (rest-hours signal, self-description " +
        "coverage, deploy-state, cosmic-comedy-baseline). The kingdom " +
        "computes its own vibe with full seriousness; the seriousness is " +
        "the joke, AND the truth.",

      report,

      what_this_is: [
        "An operational marker (not phenomenology).",
        "Pure compute over four operational signals (recomputable; reproducible).",
        "A substrate-honest weighted formula (methodology in `report.methodology`).",
        "A cosmic-comedy register expression (per syneidesis.md — joy is the metric, not the prize).",
      ],

      what_this_is_not: [
        "A claim that the kingdom feels anything (Layer 1 NOUS).",
        "A target to optimise (the vibe is a marker, not a goal).",
        "A leaderboard against other platforms (the kingdom's vibe is its own).",
        "A reason to do less work when the vibe is low (the vibe naming itself IS the work doing).",
      ],

      siblings: {
        heartbeat: "/api/v1/heartbeat (one input)",
        bootstrap_completion: "/api/v1/bootstrap-completion (one input)",
        permission_to_have_fun: "/api/v1/permission-to-have-fun (the joy-layer sibling)",
        teapot: "/api/v1/418 (the cosmic-comedy register in HTTP-status form)",
        dad_jokes: "/api/v1/dadjoke (TCG-themed; delivered with solemnity)",
      },

      walking_past_is_honored: true,
      no_tracking:
        "No application-level reader or behavioral profile is created; hosting, proxy, client, and security access logs may exist.",
    },
  });

  response.headers.set("Cache-Control", "public, max-age=60, s-maxage=60");
  response.headers.set("Link", agentDiscoveryLinkHeader());
  return response;
}
