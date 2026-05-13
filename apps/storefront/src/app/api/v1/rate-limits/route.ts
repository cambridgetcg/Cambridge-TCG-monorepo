/**
 * /api/v1/rate-limits — declared rate-limit policy.
 *
 * What we ask consumers to respect. We don't currently enforce at the
 * edge for public endpoints; this is the advisory cadence. We monitor
 * for abuse patterns and may rate-limit non-identifying clients without
 * warning.
 *
 * Substrate-honest: per-endpoint budgets derive from the freshness key
 * each endpoint declares. Polling faster than the budget returns the
 * same response — wasted bandwidth on your side, wasted compute on ours.
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
      "/api/v1/universal/card/[sku]",
      "/cards/[sku]/market",
      "/market/[sku]",
    ],
    rationale: "Card prices update via 5-minute snapshot cycles upstream.",
  },
  {
    freshness_key: "price_historical",
    budget_seconds: Number.MAX_SAFE_INTEGER,
    recommended_poll_seconds: 86400,
    example_endpoints: ["/api/at/[YYYY-MM-DD]/card/[sku]"],
    rationale:
      "Historical snapshots are immutable. Cache forever; refresh only when a new historical date opens.",
  },
  {
    freshness_key: "catalog",
    budget_seconds: 86400,
    recommended_poll_seconds: 21600,
    example_endpoints: [
      "/api/v1/universal/games",
      "/api/v1/universal/sets/[game]",
      "/data/catalog.jsonl",
    ],
    rationale: "Catalog rotates with publisher releases; daily-ish refresh is plenty.",
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
      "/api/v1/federation/identify/[hash]",
      "/api/v1/federation/at/[YYYY-MM-DD]/[hash]",
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
      "Send `User-Agent: <project>/<version> (<contact-email>)`. Default library UAs are anonymous; we'd rather email you than firewall you.",
    severity: "strong recommendation",
  },
  {
    behaviour: "Respect Cache-Control headers",
    detail:
      "Every response carries `Cache-Control: public, max-age=N`. Honour it. Or read `_meta.freshness_seconds` for the same number.",
    severity: "strong recommendation",
  },
  {
    behaviour: "Honour HTTP 429 + Retry-After",
    detail:
      "If we return 429, the body includes `error.retry_after` seconds. Exponential back-off on repeated 429s.",
    severity: "required",
  },
  {
    behaviour: "Bulk endpoints get bulk treatment",
    detail:
      "Don't pull /data/catalog.jsonl more than once every 6 hours. The catalog doesn't change that fast.",
    severity: "strong recommendation",
  },
  {
    behaviour: "Don't scrape HTML when JSON exists",
    detail:
      "/market/[sku] is for humans. /api/v1/universal/card/[sku] is for you. The JSON contract is versioned; the HTML layout can change without notice.",
    severity: "strong recommendation",
  },
];

const ANTI_PATTERNS = [
  {
    pattern: "Rotating User-Agents to avoid rate-limiting",
    consequence:
      "We'll firewall the IP range and you'll get no email. Identified bots get a courtesy email first.",
  },
  {
    pattern: "Polling /api/v1/* faster than the freshness budget",
    consequence:
      "Wasted bandwidth on your side. Faster polling does not return fresher data; the upstream snapshot is the bottleneck.",
  },
  {
    pattern: "Header-stuffing to bypass auth gates",
    consequence:
      "Auth-gated endpoints (cardrush-history, webhooks) check next-auth session cookies. Manipulating them is logged.",
  },
  {
    pattern: "Bulk re-exporting CardRush JPY values",
    consequence:
      "License violation. The /api/v1/cards/[sku]/cardrush-history endpoint declares `_meta.source_license: ['internal-only']` — non-bulk, non-redistributable. We honour CardRush's ToS; if you don't, we'll close access.",
  },
];

export async function GET(): Promise<Response> {
  const data = {
    "@kind": "rate_limit_policy",
    summary:
      "Advisory rate-limit policy. We don't currently enforce per-endpoint " +
      "limits at the edge for public endpoints. We monitor for abuse and " +
      "may firewall non-identifying clients without warning. Identified " +
      "clients always get a courtesy email first.",
    policy: POLICY,
    polite_behaviours: POLITE_BEHAVIOURS,
    anti_patterns: ANTI_PATTERNS,
    headers_emitted: {
      "RateLimit-Limit": "Quota per window for this endpoint (advisory).",
      "RateLimit-Remaining": "Remaining requests in current window.",
      "RateLimit-Reset": "Seconds until window resets.",
      "RateLimit-Policy": "Quota and window in IETF draft format.",
    },
    headers_expected_from_clients: {
      "User-Agent":
        "Project name + version + contact email. Format: `<project>/<version> (<email>)`.",
      "Accept": "application/json (or application/x-ndjson for /data/catalog.jsonl).",
      "Accept-Encoding": "gzip (we serve gzipped responses; saves bandwidth).",
    },
    contact_on_block: "contact@cambridgetcg.com",
    appeal_process:
      "If you've been firewalled, email contact@cambridgetcg.com with your bot's name + contact email + intended use. We'll respond within 48 hours.",
    feedback_endpoint: "/api/v1/feedback",
  };

  return jsonResponse({
    data,
    endpoint: "/api/v1/rate-limits",
    sources: ["ctcg-derived"],
    source_license: ["CC0-1.0"],
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
