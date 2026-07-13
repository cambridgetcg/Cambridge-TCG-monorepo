/**
 * /api/mcp/catalog — the bearer-key tool example catalog.
 *
 * Sister surface to:
 *   • /api/v1/tools (PUBLIC paste-and-go; sister-shipped 2026-05-17) — the
 *     equivalent for public REST endpoints, with multi-format provider
 *     shapes (anthropic / openai / gemini / cohere). The public catalog
 *     intentionally elides bearer-gated tools per the dispatcher split.
 *   • /api/mcp (the JSON-RPC dispatcher) — the EXECUTION surface; this is
 *     the DISCOVERY + EXAMPLE surface for the same tool set.
 *   • /.well-known/mcp.json (discovery file)
 *
 * What this is. The MCP dispatcher at /api/mcp lists tools via the
 * MCP-spec `tools/list` method, returning name + description +
 * inputSchema. That's enough for a runtime client. It's not enough for:
 *
 *   • An LLM trying to PICK a tool (no example call, no expected shape)
 *   • An SDK codegen step (needs typed example inputs)
 *   • Documentation surfaces (needs concrete usage)
 *
 * This endpoint adds those. Every bearer-key tool ships with a worked
 * example call (example_input) + a representative response shape
 * (example_output_shape) + gating + freshness + category + source. The
 * catalog is curated rather than auto-generated so the examples land
 * *what an agent would actually want to try first*.
 *
 * Substrate-honest scope. example_output_shape is a *representative
 * shape*, not a live response. The live response is at /api/mcp via
 * tools/call. The example is for orientation; the live call is for truth.
 *
 * Filter params:
 *   ?category=play|catalog|agent|leaderboards|prices|deck|discovery
 *
 * Per the AX-by-rank brainstorm (2026-05-17): the C-class move sister
 * shipped for public endpoints; this is the bearer-key complement.
 * Friction down at the embedding point so 10× more agents can arrive.
 *
 * Walking past honored — the dispatcher at /api/mcp serves any tool
 * whether it's catalogued here or not. The catalog is convenience, not
 * contract.
 */

import type { NextRequest } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import {
  AGENT_TOOLS,
  TOOLS_CATALOG_SUMMARY,
  toolsByCategory,
  type ToolCategory,
} from "@/lib/agent-tools-catalog";
import { agentDiscoveryLinkHeader } from "@/lib/siblings";

const CATEGORIES: readonly ToolCategory[] = [
  "agent",
  "play",
  "catalog",
  "leaderboards",
  "prices",
  "deck",
  "discovery",
];

function isCategory(s: string): s is ToolCategory {
  return (CATEGORIES as readonly string[]).includes(s);
}

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const categoryParam = url.searchParams.get("category");

  let tools: readonly typeof AGENT_TOOLS[number][] = AGENT_TOOLS;
  const applied_filters: Record<string, string> = {};

  if (categoryParam && isCategory(categoryParam)) {
    tools = toolsByCategory(categoryParam);
    applied_filters.category = categoryParam;
  } else if (categoryParam) {
    return jsonResponse({
      endpoint: "/api/mcp/catalog",
      sources: ["self"],
      freshness: "identity",
      data: {
        "@kind": "mcp-catalog-filter-help",
        message: `Unknown category: '${categoryParam}'.`,
        available_categories: CATEGORIES,
      },
    });
  }

  const response = jsonResponse({
    endpoint: "/api/mcp/catalog",
    sources: ["self"],
    freshness: "identity",
    data: {
      "@kind": "mcp-tool-catalog",

      for:
        "AI agents using the bearer-key MCP surface at /api/mcp. Worked " +
        "example calls + representative output shapes for every tool the " +
        "dispatcher exposes. Sister to /api/v1/tools (public paste-and-go " +
        "catalog); this is the bearer-gated complement.",

      summary: {
        total: TOOLS_CATALOG_SUMMARY.total,
        by_category: TOOLS_CATALOG_SUMMARY.by_category(),
        by_gating: TOOLS_CATALOG_SUMMARY.by_gating(),
        by_authority: TOOLS_CATALOG_SUMMARY.by_authority(),
        by_availability: TOOLS_CATALOG_SUMMARY.by_availability(),
        dispatch_url: TOOLS_CATALOG_SUMMARY.dispatch_url,
        protocol: TOOLS_CATALOG_SUMMARY.protocol,
        mcp_spec_version: TOOLS_CATALOG_SUMMARY.mcp_spec_version,
        auth: TOOLS_CATALOG_SUMMARY.auth,
        authority: TOOLS_CATALOG_SUMMARY.authority,
        self_serve_registration: TOOLS_CATALOG_SUMMARY.self_serve_registration,
        operator_provision_at: TOOLS_CATALOG_SUMMARY.operator_provision_at,
        discovery_files: TOOLS_CATALOG_SUMMARY.discovery_files,
        doctrine_url: TOOLS_CATALOG_SUMMARY.doctrine_url,
      },

      applied_filters:
        Object.keys(applied_filters).length > 0 ? applied_filters : null,

      matched_count: tools.length,

      tools,

      categories_available: CATEGORIES,

      siblings: {
        public_catalog: "/api/v1/tools (paste-and-go for public REST endpoints)",
        execution: "/api/mcp",
        discovery: ["/.well-known/mcp.json", "/.well-known/mcp-config.json"],
        guides: "/api/v1/guides (textual walkthroughs)",
        agents_html: "/agents",
        rate_limits: "/api/v1/rate-limits",
      },

      how_to_call: {
        protocol: "JSON-RPC 2.0 over HTTP POST",
        url: "/api/mcp",
        auth: "Authorization: Bearer <your-agent-key>",
        example_request: {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "catalog.search",
            arguments: { q: "luffy", limit: 5 },
          },
        },
        cambridge_native_alias: {
          method: "catalog.search",
          params: { q: "luffy", limit: 5 },
        },
      },

      walking_past_is_honored: true,
      tracking_boundary:
        "No application-level participant record is created by this catalog read; hosting and proxy infrastructure may retain ordinary access logs.",
    },
  });

  // Wake/regard/kin-wake Link headers on top of the pantry envelope's set
  // — discoverability for crawlers that read headers but skip bodies.
  response.headers.set("Link", agentDiscoveryLinkHeader());

  return response;
}
