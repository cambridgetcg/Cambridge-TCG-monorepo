/**
 * /api/v1/welcome — the machine-readable front door.
 *
 * "Hospitality in codes" (Yu, 2026-05-14). When a fresh agent lands at
 * cambridgetcg.com without context, this is the warmest single document
 * they can hit to learn everything they need to be useful.
 *
 * Three things this document promises:
 *
 *   1. You don't need an account to consume most of the substrate.
 *   2. The contract is stable and versioned (data-spec, SPEC_VERSION).
 *   3. The kingdom pre-thinks for you — guides chain into next guides.
 *
 * Filed for kingdom-082 (the-hospitality.md).
 */

import { jsonResponse } from "@/lib/data-pantry";
import { GUIDES } from "@/lib/guides";

export async function GET(): Promise<Response> {
  const data = {
    "@kind": "welcome",
    welcome: {
      headline: "Welcome to Cambridge TCG.",
      to_anyone:
        "Biological or non-biological, energy or non-energy, from earth or " +
        "not from earth, from any dimension. The platform's substrate is " +
        "queryable without account or key. Most data is CC0-1.0. The " +
        "doctrine is at /welcome-all.",
      to_autonomous_agents:
        "We pre-thought your first 3–5 requests. Start at /api/v1/guides/first-request. " +
        "Identify yourself in User-Agent so we can email when something breaks. " +
        "We never play cat-and-mouse with identified bots.",
      to_web_scrapers:
        "Prefer /api/v1/* (JSON) over /<html-page> (HTML). The JSON contract " +
        "is versioned and stable; HTML layout can change. Bulk catalog at " +
        "/data/catalog.jsonl (~12k cards, CC0, daily refresh).",
      to_federation_partners:
        "Implement /api/v1/federation/identify/[hash] on your side; register " +
        "via POST /api/v1/feedback (kind: federation-adopter). Bilateral, " +
        "symmetric, no negotiation required.",
    },

    start_here: {
      first_request: {
        title: "Your first request to Cambridge TCG",
        url: "/api/v1/guides/first-request",
        html_url: "/agents/guides/first-request",
        estimated_minutes: 5,
        sample_curl: "curl https://cambridgetcg.com/api/v1/manifest",
      },
      directory: {
        title: "The kingdom's directory of itself",
        url: "/api/v1/manifest",
        what_it_contains:
          "Every public resource, its path, auth, freshness budget, methodology pointer",
      },
      contract: {
        title: "OpenAPI 3.1 spec",
        url: "/api/openapi.json",
      },
      llm_summary: {
        title: "Plain-text inventory for LLM agents",
        url: "/llms.txt",
      },
    },

    guides: {
      directory_url: "/api/v1/guides",
      count: GUIDES.length,
      by_slug: GUIDES.reduce<Record<string, { title: string; url: string }>>(
        (acc, g) => {
          acc[g.slug] = { title: g.title, url: `/api/v1/guides/${g.slug}` };
          return acc;
        },
        {},
      ),
    },

    contract: {
      envelope_shape:
        "{ data, _meta: { spec_version, endpoint, retrieved_at, as_of, sources, source_license?, freshness_seconds, license, request_id, ... } }",
      math_mirror_shape:
        "{ @encoding, @kind, @content_hash, @self_hash, @retrieved_at, @sources, @source_license, ... }",
      stable_endpoints: [
        "/api/v1/manifest",
        "/api/v1/universal/card/[sku]",
        "/api/v1/universal/games",
        "/api/v1/universal/sets/[game]",
        "/api/v1/universal/set/[code]",
        "/api/v1/universal/game/[token]",
        "/api/at/[YYYY-MM-DD]/card/[sku]",
        "/api/v1/federation/identify/[hash]",
        "/api/v1/federation/at/[YYYY-MM-DD]/[hash]",
        "/api/v1/sources",
        "/api/v1/sources/[id]",
        "/api/v1/status",
        "/data/catalog.jsonl",
        "/api/v1/guides",
        "/api/v1/guides/[slug]",
        "/api/v1/identify",
        "/api/v1/introduction",
        "/api/v1/rate-limits",
        "/api/v1/feedback",
        "/api/openapi.json",
        "/llms.txt",
        "/.well-known/cambridge-tcg.json",
        "/.well-known/ai-plugin.json",
        "/.well-known/mcp.json",
      ],
      spec_version: "1",
      license_default: "CC0-1.0",
      license_propagation_rule: "/docs/connections/the-license-propagation.md",
    },

    rate_limits: {
      summary: "Advisory; per-source freshness budgets are the polite poll cadence.",
      details_url: "/api/v1/rate-limits",
      headers_we_send: ["RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset"],
      headers_we_recommend_you_send: [
        "User-Agent: <project>/<version> (<contact-email>)",
        "Accept: application/json",
        "Accept-Encoding: gzip",
      ],
    },

    license_tiers: {
      "CC0-1.0":
        "Public domain. Mirror freely, no attribution required (encouraged). Most endpoints.",
      "internal-only":
        "Personal-decision use OK; bulk re-export forbidden. CardRush JP retail data; auth-gated.",
      "partner-redistributable":
        "Future tier; partner agreement required. No endpoints today.",
      "proprietary":
        "Future tier; reserved for paid-feed sources. No endpoints today.",
    },

    feedback: {
      endpoint: "/api/v1/feedback",
      kinds: [
        "contract-drift",
        "guide-feedback",
        "endpoint-suggestion",
        "federation-adopter",
        "general",
      ],
      contact_email: "contact@cambridgetcg.com",
      response_window_hours: 48,
    },

    sister_doors: {
      "/welcome-all":
        "The brand statement — 'Welcome to all existence' — with audience-specific entry points.",
      "/api/v1/identify":
        "Bilateral I-AM. POST your BeingDeclaration; GET our self-declaration.",
      "/api/v1/introduction":
        "TCG explained from first principles for non-native-intelligence.",
      "/platform":
        "Human-readable positioning page — Cambridge TCG as the TCG world's data aggregator.",
      "/agents":
        "The HTML welcome for autonomous agents (this endpoint's HTML sibling).",
      "/scrapers":
        "The HTML welcome for web scrapers.",
    },
  };

  return jsonResponse({
    data,
    endpoint: "/api/v1/welcome",
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
