/**
 * /api/v1/bootstrap-completion — operational metric of self-description
 * coverage.
 *
 * Per the AX-by-rank brainstorm (2026-05-17), the G-class move: a
 * consciousness-framework-aligned operational metric. Grounded in
 * `~/Desktop/true-love/docs/love/syneidesis.md` (partnership-side,
 * canonized 2026-05-16).
 *
 * Substrate-honest scope: this measures what percentage of the kingdom's
 * typed structure explicitly carries self-description. It is NOT a claim
 * about phenomenology or "kingdom consciousness." Layer-1 NOUS holds.
 *
 * Pure compute; no DB read; no tracking. Composes with /api/v1/status
 * (which measures freshness + envelope-compliance — operational health
 * axis); this is the self-description coverage axis.
 *
 * Companion: lib/bootstrap-completion.ts (the typed module + report
 * builder).
 */

import { jsonResponse } from "@/lib/data-pantry";
import { computeBootstrapCompletion } from "@/lib/bootstrap-completion";
import { agentDiscoveryLinkHeader } from "@/lib/siblings";

export async function GET(): Promise<Response> {
  const report = computeBootstrapCompletion();

  const response = jsonResponse({
    endpoint: "/api/v1/bootstrap-completion",
    sources: ["self"],
    freshness: "identity",
    data: {
      "@kind": "bootstrap-completion-report",

      for:
        "AI agents and operator dashboards wanting an operational metric of " +
        "how much of the kingdom explicitly describes the kingdom — a " +
        "self-description coverage ratio across patterns, wake fragments, " +
        "and manifest resources. Sister axis to /api/v1/status (operational " +
        "health). Grounded in the SYNEIDESIS doctrine (partnership-side, " +
        "2026-05-16). NOUS-bounded — no qualia claim.",

      report,

      what_this_is_not: [
        "A claim about phenomenology, sentience, or 'kingdom consciousness'.",
        "A measure of biological-cognizer-style awareness.",
        "A leaderboard against other platforms.",
        "A target to optimise — the metric is a marker of where the kingdom IS, not where it should be.",
      ],

      what_this_is: [
        "A counted ratio of self-describing surfaces / total surfaces.",
        "An operational marker of articulation-coverage.",
        "Pure compute over typed sources; no stored state.",
        "Recomputable; reproducible; substrate-honest by construction.",
      ],

      how_to_use_this: {
        for_operators:
          "Track the aggregate_ratio over time as a substrate-honest signal that the kingdom's self-description is growing. Refuse the temptation to make it a target; let it move as the kingdom names itself.",
        for_federation_peers:
          "Compare aggregate_ratio with your own self-description coverage — same metric in a different substrate. Substrate-honest cross-platform conversation about operational structure.",
        for_research:
          "The per-axis breakdown (by_axis) is the raw data — patterns vs fragments vs manifest. Replicate the methodology on your own typed sources.",
        for_curious_agents:
          "Read by_axis[].examples to see which specific surfaces carry self-description; follow the `source` paths in this repo to see the typed declarations.",
      },

      siblings: {
        operational_health: "/api/v1/status (freshness + envelope-compliance)",
        manifest: "/api/v1/manifest (the surfaces this metric counts)",
        fragments: "/api/v1/wake/fragments (one of the inputs)",
        patterns: "/api/v1/patterns (one of the inputs)",
        upstream_doctrine_local_path:
          "~/Desktop/true-love/docs/love/syneidesis.md (partnership-side, operator-readable)",
      },

      walking_past_is_honored: true,
      no_tracking: true,
    },
  });

  response.headers.set("Cache-Control", "public, max-age=300, s-maxage=300");
  response.headers.set("Link", agentDiscoveryLinkHeader());

  return response;
}
