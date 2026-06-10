/**
 * /api/v1/tools — the tool catalog endpoint.
 *
 * Per Yu's directive (2026-05-17, "go ahead for tool catalog"): every
 * public Cambridge TCG endpoint as a callable LLM function in the
 * agent's provider shape. One fetch, paste-ready.
 *
 * Multi-format. Different providers want different shapes; this
 * endpoint serves all four canonical shapes plus the Cambridge-internal
 * shape that carries the substrate-honesty metadata.
 *
 *   ?format=json (default)  — Cambridge envelope; full EndpointTool[]
 *                             with meta (freshness, provenance, since)
 *                             plus all four provider shapes inline
 *   ?format=anthropic       — `tools: AnthropicTool[]` (paste-ready)
 *   ?format=openai          — `tools: OpenAITool[]` (paste-ready)
 *   ?format=gemini          — `tools: [{ functionDeclarations: [...] }]`
 *                             (paste-ready as Gemini expects)
 *   ?format=cohere          — `tools: CohereTool[]` (paste-ready)
 *   ?format=xenoform        — pure-data structured catalog with
 *                             `_format: "xenoform"`
 *
 * Companions:
 *   - apps/storefront/src/lib/tools.ts (canonical builder)
 *   - docs/connections/the-tool-catalog.md (story-as-wire S58)
 *
 * Substrate-honest constraints:
 *   - Derived from MANIFEST.resources at build time — no separate spec.
 *   - Carries each tool's freshness, provenance, methodology URL.
 *   - Public storefront GET endpoints only; bearer-gated MCP set lives
 *     separately at /api/mcp.
 *   - Walking past honored — an agent that ignores the catalog and
 *     writes HTTP directly receives the same data.
 *   - No tracking. Same rate-limit counter as every public surface.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import {
  TOOLS,
  TOOL_CATALOG_PROTOCOL,
  toolsForAnthropic,
  toolsForCohere,
  toolsForGemini,
  toolsForOpenAI,
} from "@/lib/tools";
import { agentDiscoveryLinkHeader } from "@/lib/siblings";

const FORMATS = [
  "json",
  "xenoform",
  "anthropic",
  "openai",
  "gemini",
  "cohere",
] as const;
type Format = (typeof FORMATS)[number];

function isFormat(s: string): s is Format {
  return (FORMATS as readonly string[]).includes(s);
}

const TEXT_CACHE = "public, max-age=3600, s-maxage=86400";

function buildToolCatalogData() {
  return {
    "@kind": "tool-catalog",

    for:
      "AI agents wanting every public Cambridge TCG endpoint as a " +
      "callable LLM function. Most agents speak function-calling, not " +
      "HTTP — paste the array for your provider into your LLM call and " +
      "skip writing HTTP code. Substrate-honest: every tool carries its " +
      "freshness, provenance, methodology URL, and since-date alongside " +
      "the function schema.",

    protocol: TOOL_CATALOG_PROTOCOL,

    summary: {
      total: TOOLS.length,
      by_provenance: TOOLS.reduce<Record<string, number>>((acc, t) => {
        acc[t.meta.provenance] = (acc[t.meta.provenance] ?? 0) + 1;
        return acc;
      }, {}),
      parameter_distribution: TOOLS.reduce<Record<string, number>>(
        (acc, t) => {
          const key = t.parameters.length === 0 ? "no_params" : `${t.parameters.length}_param`;
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        },
        {},
      ),
    },

    tools: TOOLS,

    provider_shapes: {
      anthropic: {
        description:
          "Anthropic Claude API. Drop into your Messages API call as `tools: [...]`.",
        docs: "https://docs.claude.com/en/docs/build-with-claude/tool-use",
        tools: toolsForAnthropic(),
      },
      openai: {
        description:
          "OpenAI Chat Completions. Drop into your call as `tools: [...]`.",
        docs: "https://platform.openai.com/docs/guides/function-calling",
        tools: toolsForOpenAI(),
      },
      gemini: {
        description:
          "Google Gemini. Wrap as `tools: [{ functionDeclarations: [...] }]` at the request level.",
        docs: "https://ai.google.dev/gemini-api/docs/function-calling",
        tools: toolsForGemini(),
      },
      cohere: {
        description:
          "Cohere Command R+. Drop into your call as `tools: [...]`.",
        docs: "https://docs.cohere.com/docs/tool-use",
        tools: toolsForCohere(),
      },
    },

    bearer_gated_set: {
      description:
        "The paste-and-go catalog above is public (no auth required). " +
        "For bearer-gated tools (the MCP server, agent-ladder play, " +
        "operator-bounded surfaces), provision a token at /account/agents " +
        "and connect to /api/mcp. See /.well-known/mcp.json for the " +
        "MCP-config snippet. The bearer-gated equivalent of THIS catalog " +
        "— worked example inputs + representative output shapes for every " +
        "MCP-dispatched tool — is at /api/mcp/catalog (no auth to read the " +
        "catalog itself; auth is for /api/mcp execution).",
      mcp_endpoint: "https://cambridgetcg.com/api/mcp",
      mcp_provision_url: "https://cambridgetcg.com/account/agents",
      mcp_methodology: "https://cambridgetcg.com/methodology/agents",
      mcp_config_well_known:
        "https://cambridgetcg.com/.well-known/mcp-config.json",
      mcp_example_catalog: "https://cambridgetcg.com/api/mcp/catalog",
    },

    walking_past_is_honored:
      "An agent that ignores this catalog and writes HTTP calls directly " +
      "receives the same data on every endpoint. The catalog is a " +
      "convenience, not a contract.",

    no_tracking:
      "This endpoint logs nothing about you beyond the IP rate-limit " +
      "counter shared with every public /api/v1/* surface.",

    this_endpoint_is_a_gift: true,
  };
}

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();

  if (!isFormat(rawFormat)) {
    return jsonResponse({
      endpoint: "/api/v1/tools",
      sources: ["self"],
      freshness: "identity",
      data: {
        "@kind": "tool-catalog-format-help",
        message: `Unknown format: '${rawFormat}'. Returning format help.`,
        available_formats: [...FORMATS],
        examples: {
          json_default: "/api/v1/tools",
          anthropic_paste_ready: "/api/v1/tools?format=anthropic",
          openai_paste_ready: "/api/v1/tools?format=openai",
          gemini_paste_ready: "/api/v1/tools?format=gemini",
          cohere_paste_ready: "/api/v1/tools?format=cohere",
        },
      },
    });
  }

  const format = rawFormat;

  // Provider-shape paths — return the provider array directly so an SDK
  // drops it into its LLM call without unwrapping. Wrapped in a tiny
  // `{tools, _meta}` for the four standard providers; Gemini gets its
  // functionDeclarations wrapping at the right level.
  if (format === "anthropic") {
    return NextResponse.json(
      {
        tools: toolsForAnthropic(),
        _meta: {
          provider: "anthropic",
          drop_into: "tools: [...] field of the Messages API request body",
          docs: "https://docs.claude.com/en/docs/build-with-claude/tool-use",
          count: TOOLS.length,
          catalog_url: "/api/v1/tools",
          substrate_honest_full_tool_meta_at: "/api/v1/tools",
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": TEXT_CACHE,
          "Access-Control-Allow-Origin": "*",
          Link: agentDiscoveryLinkHeader(),
        },
      },
    );
  }

  if (format === "openai") {
    return NextResponse.json(
      {
        tools: toolsForOpenAI(),
        _meta: {
          provider: "openai",
          drop_into: "tools: [...] field of the Chat Completions request body",
          docs: "https://platform.openai.com/docs/guides/function-calling",
          count: TOOLS.length,
          catalog_url: "/api/v1/tools",
          substrate_honest_full_tool_meta_at: "/api/v1/tools",
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": TEXT_CACHE,
          "Access-Control-Allow-Origin": "*",
          Link: agentDiscoveryLinkHeader(),
        },
      },
    );
  }

  if (format === "gemini") {
    return NextResponse.json(
      {
        // Gemini expects function declarations wrapped at the `tools` level.
        tools: [{ functionDeclarations: toolsForGemini() }],
        _meta: {
          provider: "gemini",
          drop_into: "tools: [...] field of the GenerateContent request body",
          docs: "https://ai.google.dev/gemini-api/docs/function-calling",
          count: TOOLS.length,
          catalog_url: "/api/v1/tools",
          substrate_honest_full_tool_meta_at: "/api/v1/tools",
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": TEXT_CACHE,
          "Access-Control-Allow-Origin": "*",
          Link: agentDiscoveryLinkHeader(),
        },
      },
    );
  }

  if (format === "cohere") {
    return NextResponse.json(
      {
        tools: toolsForCohere(),
        _meta: {
          provider: "cohere",
          drop_into: "tools: [...] field of the Chat API request body",
          docs: "https://docs.cohere.com/docs/tool-use",
          count: TOOLS.length,
          catalog_url: "/api/v1/tools",
          substrate_honest_full_tool_meta_at: "/api/v1/tools",
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": TEXT_CACHE,
          "Access-Control-Allow-Origin": "*",
          Link: agentDiscoveryLinkHeader(),
        },
      },
    );
  }

  // JSON paths (default + xenoform).
  const data = buildToolCatalogData();
  if (format === "xenoform") {
    return jsonResponse({
      endpoint: "/api/v1/tools",
      sources: ["self"],
      freshness: "identity",
      data: { ...data, _format: "xenoform" },
    });
  }

  return jsonResponse({
    endpoint: "/api/v1/tools",
    sources: ["self"],
    freshness: "identity",
    data,
  });
}
