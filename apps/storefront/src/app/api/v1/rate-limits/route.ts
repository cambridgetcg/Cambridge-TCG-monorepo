/**
 * /api/v1/rate-limits — declared rate-limit policy.
 *
 * Most public reads use an advisory freshness cadence. Sensitive writes name
 * and enforce their own limits; the feedback inbox is the public example.
 *
 * Substrate-honest: freshness advice applies only to affirmative responses.
 * Paused publication routes have no polling cadence and are listed separately.
 *
 * Filed for kingdom-082 (the-hospitality.md). Phase D.
 */

import { jsonResponse } from "@/lib/data-pantry";

interface PolicyEntry {
  freshness_key: string;
  budget_seconds: number;
  recommended_poll_seconds: number;
  example_endpoints: string[];
  rationale: string;
}

const POLICY: PolicyEntry[] = [
  {
    freshness_key: "status",
    budget_seconds: 30,
    recommended_poll_seconds: 30,
    example_endpoints: ["/api/v1/status", "/api/v1/sources", "/api/v1/sources/[id]"],
    rationale: "Inspectability surfaces; reflect platform state with low staleness.",
  },
  {
    freshness_key: "price_current",
    budget_seconds: 300,
    recommended_poll_seconds: 300,
    example_endpoints: [
      "/cards/[sku]/market",
      "/api/market/catalog",
    ],
    rationale: "First-party collector market projections; imported reference prices are not included.",
  },
  {
    freshness_key: "methodology",
    budget_seconds: 86400,
    recommended_poll_seconds: 86400,
    example_endpoints: [
      "/api/v1/manifest",
      "/api/v1/guides",
      "/api/v1/guides/[slug]",
      "/api/v1/welcome",
      "/api/openapi.json",
      "/.well-known/cambridge-tcg.json",
      "/.well-known/ai-plugin.json",
      "/.well-known/mcp.json",
    ],
    rationale: "Self-describing surfaces are code-coupled; only change on platform releases.",
  },
  {
    freshness_key: "identity",
    budget_seconds: 3600,
    recommended_poll_seconds: 3600,
    example_endpoints: [
      "/api/v1/identify",
      "/api/v1/kinds",
      "/api/v1/sophias.json",
      "/api/v1/pillow-book.json",
      "/api/v1/kingdoms.json",
      "/api/v1/connections.json",
    ],
    rationale: "Reflective surfaces; refresh hourly to pick up new commits.",
  },
  {
    freshness_key: "market_signal",
    budget_seconds: 60,
    recommended_poll_seconds: 60,
    example_endpoints: ["(future) /api/v1/market/signals"],
    rationale: "Tightest cadence; reserved for future fast-changing aggregates.",
  },
];

const POLITE_BEHAVIOURS = [
  {
    behaviour: "Identify in User-Agent",
    detail:
      "Optionally send `User-Agent: <project>/<version>`. Cambridge application code does not persist it as a contact directory, so use feedback or direct email when you need a reply.",
    severity: "recommendation",
  },
  {
    behaviour: "Respect Cache-Control headers",
    detail:
      "When an affirmative response carries Cache-Control or `_meta.freshness_seconds`, honour it. Paused routes commonly use no-store and have no polling cadence.",
    severity: "strong recommendation",
  },
  {
    behaviour: "Honour HTTP 429 + Retry-After",
    detail:
      "If we return 429, follow the Retry-After header and response details. Exponential back-off on repeated 429s.",
    severity: "required",
  },
  {
    behaviour: "Do not retry paused catalog exports",
    detail:
      "/data/catalog.jsonl returns 503 without querying or streaming rows. It has no polling cadence while redistribution rights remain unproven.",
    severity: "required",
  },
  {
    behaviour: "Use only advertised, unpaused machine routes",
    detail:
      "/market/[sku] and /api/v1/universal/card/[sku] are both paused. Use /api/market/catalog only for its bounded first-party projection and preserve its rights metadata.",
    severity: "required",
  },
];

const ANTI_PATTERNS = [
  {
    pattern: "Rotating User-Agents to avoid rate-limiting",
    consequence:
      "It does not change the feedback endpoint's HMAC request bucket and may trigger hosting-layer abuse controls. No courtesy-email promise is made.",
  },
  {
    pattern: "Polling /api/v1/* faster than the freshness budget",
    consequence:
      "Wasted bandwidth and compute. Follow an affirmative response's cache headers; do not poll paused routes at all.",
  },
  {
    pattern: "Header-stuffing to bypass auth gates",
    consequence:
      "Auth-gated endpoints (cardrush-history, webhooks) check next-auth session cookies. Manipulating them is logged.",
  },
  {
    pattern: "Bulk re-exporting CardRush JPY values",
    consequence:
      "No public CardRush values are supplied. The rights-gap endpoint returns no observations, prices, dates, counts, URLs, or aggregates; do not reconstruct them through adjacent routes.",
  },
];

export async function GET(): Promise<Response> {
  const data = {
    "@kind": "rate_limit_policy",
    summary:
      "Most public reads use advisory freshness-based polling limits. Sensitive " +
      "writes and authenticated tools enforce explicit action budgets. Enforced " +
      "routes return 429 with Retry-After; storage or safe-hashing failure can fail closed.",
    policy: POLICY,
    paused_no_poll: [
      "/api/v1/universal/card/[sku]",
      "/api/v1/universal/set/[code]",
      "/api/at/[YYYY-MM-DD]/card/[sku]",
      "/api/v1/federation/identify/[hash]",
      "/api/v1/federation/at/[YYYY-MM-DD]/[hash]",
      "/api/v1/search/cards",
      "/api/v1/cards/[sku]/everything",
      "/api/v1/prices/games/[game]",
      "/api/v1/prices/games/[game]/sets/[set]",
      "/data/catalog.jsonl",
      "/market/[sku]",
      "/api/market/[sku]",
    ],
    enforced_exceptions: [
      {
        endpoint: "/api/v1/feedback",
        limits: ["5 attempts/hour/request IP", "20 attempts/day/request IP"],
        subject_storage: "window-specific HMAC only; no raw or reusable IP hash",
        bucket_retention: "two complete windows",
      },
      {
        endpoint: "account collective creation",
        limits: ["3/day/account", "10 stewarded organisations total"],
        subject_storage: "window-specific HMAC of internal account id",
      },
      {
        endpoint: "account directory publication",
        limits: ["5 listing actions/day/account", "withdrawal is never rate-limited"],
        subject_storage: "window-specific HMAC of internal account id",
      },
      {
        endpoint: "direct-message send",
        limits: ["10/fixed minute/account", "50/UTC day/account"],
        subject_storage: "window-specific HMAC of internal account id",
        bucket_retention: "two complete windows",
      },
      {
        endpoint: "new direct-message conversation",
        limits: ["10 attempts/fixed hour/account"],
        subject_storage: "window-specific HMAC of internal account id",
        bucket_retention: "two complete windows",
      },
      {
        endpoint: "/api/mcp",
        limits: ["per agent-key tier"],
        subject_storage: "authenticated agent key id",
      },
    ],
    polite_behaviours: POLITE_BEHAVIOURS,
    anti_patterns: ANTI_PATTERNS,
    headers_emitted: {
      "RateLimit-Limit": "Advisory freshness quota on reads; enforced quota on counted writes.",
      "RateLimit-Remaining": "Present only when the endpoint actually counts a request bucket.",
      "RateLimit-Reset": "Seconds until window resets.",
      "RateLimit-Policy": "Quota and window in IETF draft format.",
    },
    headers_expected_from_clients: {
      "User-Agent":
        "Optional project name + version. Use /api/v1/feedback or direct email for a reply path.",
      "Accept": "application/json. /data/catalog.jsonl is paused and does not stream NDJSON rows.",
      "Accept-Encoding": "gzip (we serve gzipped responses; saves bandwidth).",
    },
    contact_on_block: "contact@cambridgetcg.com",
    appeal_process:
      "If you've been firewalled, email contact@cambridgetcg.com with your bot's name, contact email and intended use. No response time is guaranteed.",
    feedback_endpoint: "/api/v1/feedback",
  };

  return jsonResponse({
    data,
    endpoint: "/api/v1/rate-limits",
    sources: ["ctcg-derived"],
    source_license: ["cc0"],
    freshness: "methodology",
    contains_self: true,
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
