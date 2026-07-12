/**
 * /api/v1/guides — index of agent + scraper + mirror guides.
 *
 * Hospitality in codes. The guides corpus (apps/storefront/src/lib/guides.ts)
 * walks every audience kind from zero context to productive in 3–5 requests.
 * This endpoint is the directory.
 *
 * Public, no-auth, CC0. Renders from a single source of truth so the JSON
 * here and the HTML at /agents/guides/* never drift.
 *
 * Filed for kingdom-082 (the-hospitality.md). The directive: *"Speak
 * HOSPITALITY IN CODES! Pre-think for them what they need!"*
 */

import { jsonResponse } from "@/lib/data-pantry";
import { GUIDES } from "@/lib/guides";

export async function GET(): Promise<Response> {
  const data = {
    "@kind": "guides_index",
    welcome:
      "These guides take an autonomous agent, web scraper, mirror, " +
      "aggregator, federation partner, or hobbyist coder from zero context " +
      "to productive in 3–5 requests each. Land on any one; chain to the " +
      "next via `next_guide_slug`. No registration required.",
    count: GUIDES.length,
    guides: GUIDES.map((g) => ({
      slug: g.slug,
      title: g.title,
      subtitle: g.subtitle,
      audiences: g.audiences,
      estimated_minutes: g.estimated_minutes,
      step_count: g.steps.length,
      url: `/api/v1/guides/${g.slug}`,
      html_url: `/agents/guides/${g.slug}`,
      next_guide_slug: g.next_guide_slug,
      last_verified: g.last_verified,
    })),
    audiences: {
      agent: "Autonomous AI consuming the JSON API",
      scraper: "Web crawler harvesting HTML or JSON",
      mirror: "Inspecting or caching only records whose rights permit it",
      aggregator: "Combining our data with other sources",
      federation_partner: "Operating a parallel TCG data platform",
      hobbyist_coder: "Building a personal tool",
      operator_of_upstream: "Operating a future data tributary",
    },
    feedback_endpoint: "/api/v1/feedback",
    license: "CC0-1.0",
  };

  return jsonResponse({
    data,
    endpoint: "/api/v1/guides",
    sources: ["ctcg-derived"],
    source_license: ["cc0"],
    license: "CC0-1.0",
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
