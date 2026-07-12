/**
 * /api/v1/budget — the crawl-budget advisory.
 *
 * Per Yu's directive 2026-05-17: *"Think about agent experience and
 * agent interface for cambridgetcg."* Eliminates the planning-guesswork
 * an agent does before starting a crawl. Composes rate-limits +
 * catalog-size + freshness budgets + recommended pace into one
 * single-fetch planning shape.
 *
 * ── What this is ────────────────────────────────────────────────────────
 *
 * An agent that wants to mirror the catalog, watch N SKUs, federate, or
 * pull a one-time snapshot needs to answer:
 *
 *   - How big is the catalog? How long will a full mirror take?
 *   - What's the polite-poll pace? Bearer vs unauth?
 *   - What's the freshness floor per data class? When am I wasting cycles?
 *   - When are peak hours? Can I avoid them?
 *   - Is there a faster channel (events, deltas) than polling?
 *
 * This endpoint answers all of the above in one fetch, substrate-honest
 * about what the platform knows vs. doesn't know yet.
 *
 * Cache: identity content with hourly refresh (catalog-size estimates
 * are stable at hour-scale). Agents bookmark this URL; re-fetch when
 * spec changes (see /api/v1/changelog — multi-format feed, ?since= filter).
 *
 * Companion doc: docs/connections/the-ax.md (AX framing).
 */

import { jsonResponse, FRESHNESS } from "@/lib/data-pantry";

export const dynamic = "force-static";
export const revalidate = 3600;

/** Static catalog-size estimates. Refreshed periodically; substrate-
 *  honest `as_of` field on each row. Live counts are not exposed at
 *  this surface — agents needing exact counts hit /api/v1/sources for
 *  per-source live row counts, or walk the sitemap. */
const CATALOG_SIZE_ESTIMATE = {
  cards_estimated: 12_000,
  games_active: 21,
  sets_per_game_avg: 12,
  sources_active: 6,
  oracle_groups_estimated: 8_000,
  as_of: "2026-05-17",
  precision:
    "order-of-magnitude estimate; live per-source counts at /api/v1/sources",
  freshness_note:
    "catalog grows ~10-50 SKUs/day from active ingest; full-mirror eta is stable at week-scale",
};

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
      "Complete one-time snapshot of every public SKU in the catalog.",
    endpoints_required: [
      "/api/v1/universal/games (one fetch)",
      "/api/v1/universal/sets/{game} (one per game; 21 fetches)",
      "/api/v1/universal/card/{sku} (one per card; 12_000 fetches)",
    ],
    total_requests_estimated: 12_022,
    bandwidth_estimate_mb: 60,
    eta_seconds_at_unauth_pace_estimated: Math.round((12_022 / 60) * 60),
    eta_human: "about 3.5 hours at 60 req/min unauth",
    cacheable_for_seconds: 86_400,
    bulk_alternative:
      "/data/catalog.jsonl — one public JSONL fetch, capped at 50k rows; aggregate reuse rights are NOASSERTION until row-level lineage is complete",
    incremental_alternative:
      "after first mirror, refetch per-card on freshness expiry; cards refresh hourly-to-daily depending on activity",
  },
  watchlist: {
    description:
      "Watch a set of N SKUs for price/state changes. Polling model.",
    endpoints_required: [
      "/api/v1/universal/card/{sku} (one per SKU per freshness cycle)",
    ],
    polling_interval_floor_seconds: 60,
    polling_interval_recommended_seconds: 300,
    rationale:
      "per-card freshness budget is ~300s for live market data; faster polling returns the same response from cache.",
    bandwidth_per_poll_kb: 5,
    future_alternative:
      "event channel planned per docs/connections/the-distributed-wake.md recursion target (the-channels.md) — SSE / webhook / RSS / atom; eliminates polling for watchlist use",
  },
  federation: {
    description:
      "Build a federation peer: implement /api/v1/federation/identify/{hash} on your side; register via POST /api/v1/feedback (kind: federation-adopter).",
    endpoints_required: [
      "/api/v1/federation/identify/{hash} (one per unknown hash; cache hit on repeat lookups)",
      "/api/v1/federation/at/{YYYY-MM-DD}/{hash} (one per historical-hash lookup)",
    ],
    rate_pattern:
      "low-volume; on-demand reverse-resolution. Cache hits eliminate most fetches.",
    cacheable_for_seconds: 86_400 * 365,
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
    fast: ["/api/v1/universal/card/{sku} (current-state price view)"],
    moderate: ["/api/v1/sources/{id} (per-source state)"],
    slow: ["/api/v1/sources (every source + last-run state)"],
    daily: ["/data/catalog.jsonl (live bulk inspection export)"],
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
      "Planning a crawl. Single-fetch advisory composing catalog-size + " +
      "recommended pace + freshness floors + per-shape ETA. Substrate-" +
      "honest about what the platform knows vs. doesn't yet measure.",

    catalog_size: CATALOG_SIZE_ESTIMATE,
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
      math_mirror_card_typical: 5,
      catalog_listing_per_page_typical: 50,
      wake_full_document: 5,
      wake_fragment_in_envelope: 0.4,
    },

    headers_to_send: {
      "User-Agent":
        "<your-project>/<version> (<contact-email>) — identification is the politest signal",
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
      "Identify yourself in User-Agent so we can email if something breaks mid-crawl",
      "Cache aggressively: most endpoints honour Cache-Control and ETag",
      "Checkpoint the URL you last fetched and resume from it — `_meta.next_link` is reserved in the envelope but currently null on every endpoint (no list endpoint paginates by cursor yet)",
      "For bulk inspection, /data/catalog.jsonl is live and capped at 50k rows; its aggregate rights are NOASSERTION, so access is not redistribution permission",
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
      sources: "/api/v1/sources — per-source live state + license tier",
      status: "/api/v1/status — per-endpoint freshness budget + envelope-compliance",
      guides: "/api/v1/guides/first-request — the 5-minute walkthrough",
      changelog: "/api/v1/changelog — spec-change feed; subscribe-once (json / atom / md)",
      api_root: "/api/v1/ — tiny root index naming the orientation surfaces",
      ax_doctrine: "/docs/connections/the-ax.md",
    },

    walking_past_is_honored: true,
    no_tracking:
      "This endpoint logs nothing about you beyond the IP rate-limit counter shared with every public /api/v1/* surface.",
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
      "live catalog-size counts (the as_of estimate refreshes hourly; live counts via /api/v1/sources)",
      "peak-hour telemetry (the platform does not currently measure load patterns)",
      "guaranteed-completion windows for bulk crawls (best-effort only)",
      "throttling decisions made about your specific User-Agent (no per-agent state)",
    ],
  });
}
