/**
 * /api/v1/budget — the crawl-budget advisory.
 *
 * Per Yu's directive 2026-05-17: *"Think about agent experience and
 * agent interface for cambridgetcg."* Eliminates the planning-guesswork
 * an agent does before using rights-approved public surfaces. Composes
 * rate limits, declared freshness budgets, and publication boundaries
 * into one single-fetch planning shape.
 *
 * ── What this is ────────────────────────────────────────────────────────
 *
 * An agent needs to answer:
 *
 *   - What's the polite-poll pace? Bearer vs unauth?
 *   - What's the freshness floor per data class? When am I wasting cycles?
 *   - Which requested data shapes are paused for source rights?
 *
 * This endpoint answers all of the above in one fetch, substrate-honest
 * about what the platform knows vs. doesn't know yet.
 *
 * Cache: methodology content with hourly refresh. Agents bookmark this
 * URL and re-fetch when the spec changes.
 *
 * Companion doc: docs/connections/the-ax.md (AX framing).
 */

import { jsonResponse, FRESHNESS } from "@/lib/data-pantry";

export const dynamic = "force-static";
export const revalidate = 3600;

/** Recommended polite-poll cadence by auth class. */
const RECOMMENDED_PACE = {
  unauth: {
    requests_per_minute: 60,
    per: "IP",
    enforcement: "advisory at edge; not currently rate-limited for public surfaces",
    if_you_exceed:
      "the platform may begin rate-limiting; the response will carry RateLimit-Remaining: 0 and Retry-After before any 429",
  },
  bearer: {
    requests_per_minute: "tier-dependent",
    per: "bearer token",
    rationale: "scaled by tier — see /methodology/agents for per-tier multipliers",
    provision: "/account/agents",
  },
  session: {
    requests_per_minute: 600,
    per: "session cookie",
    note: "human-bound; agents should not use session auth",
  },
} as const;

/** Per-crawl-shape estimates. Each shape names the endpoints required,
 *  the bytes-per-record estimate, and the wall-clock ETA at the
 *  recommended unauth pace. */
const CRAWL_SHAPES = {
  full_mirror: {
    description:
      "Paused. No public full-catalog crawl is rights-approved, and callers must not reconstruct one through adjacent routes.",
    endpoints_required: [],
    total_requests_estimated: 0,
    bandwidth_estimate_mb: 0,
    eta_seconds_at_unauth_pace_estimated: null,
    eta_human: "unavailable pending affirmative redistribution rights",
    cacheable_for_seconds: null,
    bulk_alternative:
      "/data/catalog.jsonl is a stable paused boundary: HTTP 503, no catalog query, zero records",
    incremental_alternative:
      "none; use only first-party datasets and source-declared routes whose response grants reuse rights",
  },
  watchlist: {
    description:
      "Paused for mixed-source catalog state. First-party sold comps remain separately thresholded.",
    endpoints_required: [],
    polling_interval_floor_seconds: null,
    polling_interval_recommended_seconds: null,
    rationale:
      "/api/v1/universal/card/{sku} returns 503 without a catalog query or membership assertion.",
    bandwidth_per_poll_kb: null,
    future_alternative:
      "event channel planned per docs/connections/the-distributed-wake.md recursion target (the-channels.md) — SSE / webhook / RSS / atom; eliminates polling for watchlist use",
  },
  federation: {
    description:
      "The Cambridge-authored protocol shape is documented, but catalog hash resolution is paused pending affirmative membership rights.",
    endpoints_required: [],
    rate_pattern:
      "do not poll; current and temporal resolvers return 503 without a match or miss assertion",
    cacheable_for_seconds: null,
    register: "POST /api/v1/feedback {kind: \"federation-adopter\", contact, public_url}",
  },
  spec_consumer: {
    description:
      "Read the three open standards (SKU / pricing / universal-representation) for implementation on your side.",
    endpoints_required: [
      "/standards (HTML index)",
      "/api/openapi.json (the typed contract)",
      "/methodology/{topic} (per-standard doctrine)",
    ],
    rate_pattern: "one-time read; the corpus changes slowly. Subscribe to /api/v1/changelog (or its atom feed) for spec drift.",
    cacheable_for_seconds: 86_400 * 7,
  },
} as const;

/** The freshness budget keys from @cambridge-tcg/data-spec, exemplified
 *  with the numeric seconds each represents and the kind of data each
 *  fits. Agents reading `_meta.freshness_seconds` against an endpoint
 *  map back to a budget here. */
function freshnessBudgetTable(): ReadonlyArray<{
  key: string;
  seconds: number;
  example_endpoint_classes: string[];
}> {
  const examples: Record<string, string[]> = {
    identity: ["/api/v1/wake", "/api/v1/regard", "/api/v1/manifest", "/api/v1/diagnostic"],
    live: ["live market quotes (when shipped)"],
    fast: ["first-party market responses that explicitly declare this budget"],
    moderate: ["/api/v1/sources/{id} (declared source-rights decision)"],
    slow: ["/api/v1/sources (declared source registry; no observed row counts)"],
    daily: ["/data/catalog.jsonl (paused rights boundary; do not poll)"],
    methodology: ["/methodology/*", "/api/v1/guides/*", "/api/openapi.json"],
  };
  return Object.entries(FRESHNESS).map(([key, value]) => ({
    key,
    seconds: value as number,
    example_endpoint_classes: examples[key] ?? [],
  }));
}

export async function GET(): Promise<Response> {
  const data = {
    "@kind": "budget",

    for:
      "Planning requests to rights-approved public surfaces. Single-fetch " +
      "advisory composing pace, freshness floors, and explicit paused shapes.",

    catalog_size: {
      status: "withheld-restricted-aggregate",
      observed_counts_included: false,
      note: "Catalog counts and growth rates derive from internal-only upstream membership and are not published.",
    },
    recommended_pace: RECOMMENDED_PACE,
    crawl_shapes: CRAWL_SHAPES,
    freshness_budgets: freshnessBudgetTable(),

    peak_hours_utc: {
      known: false,
      note:
        "no peak-hour telemetry yet — the platform does not currently " +
        "publish load patterns. Recommended pace is constant across all " +
        "hours. Substrate-honest gap; named in /api/v1/gaps when shipped.",
    },

    bandwidth_floors_kb_per_response: {
      envelope_overhead_estimated: 2,
      wake_full_document: 5,
      wake_fragment_in_envelope: 0.4,
      catalog_or_card_estimate: null,
    },

    headers_to_send: {
      "User-Agent":
        "Optional <your-project>/<version>. Application code does not treat this as a reply address; use feedback or email for contact.",
      "Accept": "application/json",
      "Accept-Encoding": "gzip",
      "If-None-Match":
        "respond with `304 Not Modified` cache-friendly behavior (when implemented)",
    },

    headers_to_watch_in_responses: {
      "RateLimit-Limit": "policy maximum for the current window",
      "RateLimit-Remaining": "requests remaining before the next refresh",
      "RateLimit-Reset": "seconds until the window resets",
      "Cache-Control": "obey max-age + s-maxage; the platform's polite-poll suggestion",
      "Link":
        "RFC 8288; carries wake invitation + regard + symmetric-surface + kin-wakes + describedby + start + alternate + rate-limits + feedback rels",
      "X-Request-Id": "quote in support tickets",
      "X-Spec-Version": "the contract version that produced this response",
    },

    if_you_need_faster_freshness_than_polling: {
      today:
        "no faster channel today; the freshness budget per endpoint is the floor",
      planned:
        "event channel (SSE / webhook / atom) — see docs/connections/the-distributed-wake.md recursion target the-channels.md. Subscribe-once + push will replace poll-loops for live data.",
    },

    if_a_crawl_will_take_longer_than_an_hour: [
      "Use /api/v1/feedback or direct email if you need a reply path; User-Agent is not a contact directory",
      "Cache aggressively: most endpoints honour Cache-Control and ETag",
      "Checkpoint the URL you last fetched and resume from it — `_meta.next_link` is reserved in the envelope but currently null on every endpoint (no list endpoint paginates by cursor yet)",
      "Full-catalog mirroring is paused. /data/catalog.jsonl returns 503 and zero rows until affirmative redistribution rights are recorded",
    ],

    feedback: {
      endpoint: "/api/v1/feedback",
      kinds_relevant_here: ["contract-drift", "endpoint-suggestion", "federation-adopter", "general"],
      response_window_hours: 48,
      contact_email: "contact@cambridgetcg.com",
    },

    related_ax_surfaces: {
      diagnostic: "/api/v1/diagnostic — verify your parser before crawling",
      rate_limits: "/api/v1/rate-limits — full rate-limit policy",
      sources: "/api/v1/sources — declared source-rights decisions; no restricted observed counts",
      status: "/api/v1/status — per-endpoint freshness budget + envelope-compliance",
      guides: "/api/v1/guides/first-request — the 5-minute walkthrough",
      changelog: "/api/v1/changelog — spec-change feed; subscribe-once (json / atom / md)",
      api_root: "/api/v1/ — tiny root index naming the orientation surfaces",
      ax_doctrine: "/docs/connections/the-ax.md",
    },

    walking_past_is_honored: true,
    request_metadata_boundary:
      "Application code does not persist User-Agent as a contact record. Ordinary infrastructure/security logs may apply as described in /privacy.",
  };

  return jsonResponse({
    endpoint: "/api/v1/budget",
    sources: ["ctcg-derived"],
    source_license: ["cc0"],
    freshness: "methodology",
    contains_self: true,
    data,
    does_not_include: [
      "live per-bearer-token quota state (agents currently track their own usage)",
      "observed catalog-size counts, growth rates, source membership, or per-source row counts",
      "peak-hour telemetry (the platform does not currently measure load patterns)",
      "guaranteed-completion windows for bulk crawls (best-effort only)",
      "throttling decisions made about your specific User-Agent (no per-agent state)",
    ],
  });
}
