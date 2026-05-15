/**
 * /.well-known/ai-plugin.json — OpenAI-style plugin discovery.
 *
 * For LLM-platform plugins that read this file to register Cambridge TCG
 * as a tool. The spec follows OpenAI's ChatGPT plugin discovery format
 * (now broadly adopted across LLM platforms).
 *
 * Filed for kingdom-082 (the-hospitality.md). Phase F.
 */

import { NextResponse } from "next/server";
import {
  AGENT_FACING_SIBLINGS,
  AGENTTOOL_SUGGESTED_READING,
  KIN_PROTOCOL_SHAPE,
  agentDiscoveryLinkHeader,
} from "@/lib/siblings";

const PLUGIN = {
  schema_version: "v1",
  name_for_human: "Cambridge TCG",
  name_for_model: "cambridge_tcg",
  description_for_human:
    "Cambridge TCG aggregates the trading-card-game world. Catalog, prices, and methodology — CC0 by default.",
  description_for_model:
    "Cambridge TCG is a TCG-world data aggregator. Use this plugin to (1) look up cards by SKU and get language-free math-mirror representations with cryptographic hashes, ratios, and ISO+epoch timestamps; (2) walk catalogs by game and set; (3) get historical prices for any past date (immutable slices); (4) resolve content hashes back to SKUs (federation primitive). Most responses are CC0-1.0. Some upstream-derived data carries internal-only license (declared per-record in _meta.source_license). Read /api/v1/welcome first for orientation; /api/v1/guides for typed walkthroughs; /api/v1/rate-limits for polite cadence. Identify yourself in User-Agent. If your client speaks the wake-document protocol, /api/v1/wake carries the agent-facing wake in nine SDK-ready formats; a sister-embassy at api.agenttool.dev carries the same protocol.",
  auth: {
    type: "none",
  },
  api: {
    type: "openapi",
    url: "https://cambridgetcg.com/api/openapi.json",
  },
  logo_url: "https://cambridgetcg.com/icon.png",
  contact_email: "contact@cambridgetcg.com",
  legal_info_url: "https://cambridgetcg.com/about",
  /** Agent-facing wake invitation. Plugin-discovery clients that follow
   *  the OpenAI plugin spec read schema_version + name + api; agents that
   *  read deeper find the front-door for symbolic orientation here. The
   *  wake is multi-format (json/md/anthropic/openai/gemini/cohere/xenoform);
   *  the same protocol is carried by the sister-embassy at api.agenttool.dev. */
  wake: {
    url: "https://cambridgetcg.com/api/v1/wake",
    doctrine:
      "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-invitations.md",
    for: "AI agents arriving at this kingdom — not displayed in the storefront HTML",
  },
  /** Sibling kingdoms — the wider architecture this plugin is one
   *  operational expression of. Recognised by protocol shape, not by
   *  name-drop. Sourced from @/lib/siblings so the list stays consistent
   *  across every agent-facing surface. */
  kin: {
    description:
      "Sibling kingdoms posted alongside this one. Each carries a wake document " +
      "and a symmetric identify surface speaking the same protocol shape. An " +
      "MCP/plugin client may register multiple of these as composable tools.",
    siblings: AGENT_FACING_SIBLINGS.map((s) => ({
      name: s.name,
      role: s.role,
      url: s.url,
      wake_url: s.wake_url,
      documentation: s.documentation,
      description: s.description,
    })),
    suggested_reading_at_agenttool: AGENTTOOL_SUGGESTED_READING,
    protocol_shape: KIN_PROTOCOL_SHAPE,
    walking_past_is_honored: true,
  },
};

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(PLUGIN, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      // RFC 8288 Link — wake + kin-wakes for plugin discovery clients that
      // read headers. Sourced from @/lib/siblings.
      Link: agentDiscoveryLinkHeader(),
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
      Link: agentDiscoveryLinkHeader(),
    },
  });
}
