/**
 * /api/v1/health — system health for agent retry decisions.
 *
 * Per Yu's directive 2026-05-18: *"LETS DIVERSIFY OUR SURPRISE AGENT
 * WITH INFRA THEY NEED PROTOCOL 😏😂"* — third of three small operational
 * surfaces (companions: /api/v1/time, /api/v1/echo).
 *
 * ── What this is ────────────────────────────────────────────────────────
 *
 * Agents that get an error need to decide: retry immediately? back off?
 * give up? report? The decision depends on whether the failure is the
 * agent's request, the kingdom's load, or the kingdom's upstream.
 *
 * This endpoint returns one rolled-up answer:
 *
 *   { "status": "ok" | "degraded" | "down",
 *     "recommendation": "<one of five retry strategies>",
 *     "subsystems": { ... per-subsystem state } }
 *
 * Substrate-honest scope:
 *  - The fact that this endpoint returns proves the process is up.
 *  - Subsystem health is best-effort; deep upstream-health aggregation
 *    is at /api/v1/sources (which is the canonical per-source live state).
 *  - No per-region health (kingdom is single-region today).
 *  - No SLA claims — the kingdom is a small operator; agents that
 *    need formal SLAs should contact via /api/v1/feedback.
 *
 * Cache: 10s. Agents polling for retry advice get fresh data without
 * hammering the kingdom; CDN absorbs the burst.
 *
 * Companion: docs/connections/the-agent-infra.md
 */

import { jsonResponse } from "@/lib/data-pantry";

type SubsystemStatus = "ok" | "degraded" | "unknown" | "down";

interface Subsystem {
  status: SubsystemStatus;
  detail: string;
  canonical_source?: string;
}

interface KingdomHealth {
  status: SubsystemStatus;
  recommendation:
    | "retry-immediately"
    | "retry-with-backoff"
    | "wait-60s"
    | "wait-300s"
    | "report-via-feedback";
  recommendation_rationale: string;
}

function rollUp(subs: Record<string, Subsystem>): KingdomHealth {
  const statuses = Object.values(subs).map((s) => s.status);
  if (statuses.some((s) => s === "down")) {
    return {
      status: "down",
      recommendation: "wait-300s",
      recommendation_rationale:
        "At least one subsystem is fully down. Immediate retries will fail; wait 5 minutes and check this endpoint again. If down persists for >15 minutes, report via /api/v1/feedback.",
    };
  }
  if (statuses.some((s) => s === "degraded")) {
    return {
      status: "degraded",
      recommendation: "retry-with-backoff",
      recommendation_rationale:
        "Subsystem reports degraded performance. Use exponential backoff (initial 1s, max 60s) before retry. Cached responses still served normally.",
    };
  }
  if (statuses.every((s) => s === "ok")) {
    return {
      status: "ok",
      recommendation: "retry-immediately",
      recommendation_rationale:
        "All subsystems healthy. If your previous request failed, the failure is likely client-side (bad params, expired auth, missing required header) — check /api/v1/echo to see what the kingdom received.",
    };
  }
  // Mix of ok + unknown
  return {
    status: "ok",
    recommendation: "retry-with-backoff",
    recommendation_rationale:
      "Core subsystems healthy; some subsystem state is unknown (the kingdom doesn't probe everything continuously). Modest backoff is polite.",
  };
}

export async function GET(): Promise<Response> {
  // The fact this responds proves the process is up + the response
  // envelope assembles cleanly.
  const subsystems: Record<string, Subsystem> = {
    api_process: {
      status: "ok",
      detail:
        "This endpoint returning proves the Next.js process is alive and the envelope assembles correctly.",
    },
    data_plane: {
      status: "unknown",
      detail:
        "Deep data-plane health is at /api/v1/sources (per-source last-run state). This endpoint does not aggregate live source health into a single roll-up — substrate-honest about scope; aggregation is on the AX roadmap.",
      canonical_source: "/api/v1/sources",
    },
    wake_protocol: {
      status: "ok",
      detail:
        "The wake protocol is static-typed content; if this endpoint serves, /api/v1/wake serves.",
      canonical_source: "/api/v1/wake",
    },
    changelog: {
      status: "ok",
      detail: "Changelog is static-typed content; available as long as the process is up.",
      canonical_source: "/api/v1/changelog",
    },
    agents_notebook: {
      status: "ok",
      detail:
        "Agent notebook GET serves the editorial seed corpus. Participant database storage and publication are disabled; the witness-only POST echo is not persisted.",
      canonical_source: "/api/v1/agents/notes",
    },
  };

  const rolled = rollUp(subsystems);
  const now = new Date().toISOString();

  const data = {
    "@kind": "health",

    for:
      "Agents deciding whether to retry after an error. The recommendation field tells you which retry strategy fits the current kingdom state.",

    ...rolled,
    as_of: now,
    subsystems,

    retry_strategies_glossary: {
      "retry-immediately":
        "Kingdom is healthy. Your previous failure was likely client-side — check /api/v1/echo to see what the kingdom received from your request.",
      "retry-with-backoff":
        "Use exponential backoff: 1s → 2s → 4s → 8s → ... capped at 60s. Stop after 5 attempts and check this endpoint again.",
      "wait-60s":
        "Wait one minute before retry. The kingdom is processing a transient load or upstream issue.",
      "wait-300s":
        "Wait five minutes before retry. Sustained issue; immediate retries will fail. If still degraded after 15 minutes, report via feedback.",
      "report-via-feedback":
        "POST /api/v1/feedback {kind: 'general', detail: 'health check returned X for >Y minutes'}. The kingdom monitors feedback; sustained issues get attention.",
    },

    contract: {
      response_window:
        "This endpoint targets <100ms response time (no upstream calls). If it takes longer, suspect platform-level latency, not subsystem health.",
      cache_max_age_seconds: 10,
      reasoning:
        "Short cache (10s) lets CDN absorb polling bursts while still giving agents fresh data for retry decisions.",
    },

    related_surfaces: {
      time: "/api/v1/time — server clock + skew",
      echo: "/api/v1/echo — see what the kingdom received from your last request",
      sources: "/api/v1/sources — per-source live ingest state (the deeper health surface)",
      status: "/api/v1/status — per-endpoint freshness budget + envelope-compliance",
      feedback: "/api/v1/feedback — report sustained health issues",
      changelog: "/api/v1/changelog — subscribe to know when health surfaces evolve",
    },

    not_an_sla_claim:
      "The kingdom is a small operator and does not publish formal SLAs. This endpoint is best-effort observational data, not a service commitment. Agents needing formal SLAs should contact via /api/v1/feedback.",

    walking_past_is_honored: true,
    no_tracking:
      "This endpoint logs nothing about you beyond the IP rate-limit counter shared with every public /api/v1/* surface.",
  };

  return jsonResponse({
    endpoint: "/api/v1/health",
    sources: ["self"],
    source_license: ["cc0"],
    freshness: "live",
    contains_self: true,
    cache_max_age: 10,
    cache_s_max_age: 10,
    data,
    does_not_include: [
      "per-region health (kingdom is single-region; no geographic rollup)",
      "live deep-subsystem probes (this endpoint reports kingdom-process-is-running + static subsystem facts; live DB / upstream probes are at /api/v1/sources, not aggregated here)",
      "SLA commitments (kingdom is small-operator; not making availability promises)",
      "historical uptime data (substrate-honest gap; no time-series uptime store today)",
      "per-agent health (the kingdom is the same kingdom for every caller; no per-agent degradation)",
    ],
  });
}
