/**
 * /.well-known/mcp.json — MCP (Model Context Protocol) discovery.
 *
 * Surfaces the platform's MCP gate (already live at /api/mcp, kingdom-051
 * S18 — the bearer-token agent door) plus a curated list of read-tools the
 * platform suggests an MCP client wire into its toolbelt. The actual MCP
 * server transport lives at /api/mcp; this discovery doc describes it.
 *
 * Filed for kingdom-082 (the-hospitality.md). Phase F.
 */

import { NextResponse } from "next/server";

const MCP = {
  protocol_version: "2024-11-05",
  server: {
    name: "cambridge-tcg",
    version: "1.0.0",
    description:
      "Cambridge TCG MCP server. Read-tools for catalog, prices, federation, and methodology. " +
      "Bearer-token auth (provision per agent via /account/agents, doctrine at /methodology/agents). " +
      "actor_kind=agent threads through every call; operated_by_user_id is upstream-responsible.",
    transport: "https",
    endpoint: "https://cambridgetcg.com/api/mcp",
    auth: {
      type: "bearer",
      provision_url: "https://cambridgetcg.com/account/agents",
      methodology_url: "https://cambridgetcg.com/methodology/agents",
    },
  },
  suggested_tools: [
    {
      name: "get_card",
      description:
        "Look up a card by canonical SKU. Returns the math-mirror universal representation with content_hash, sources, source_license. Public; no auth required.",
      direct_endpoint: "GET /api/v1/universal/card/{sku}",
      example_sku: "op-op01-001-ja",
      cache_ttl_seconds: 300,
    },
    {
      name: "list_games",
      description: "Every TCG game in the catalog. Stable; daily-ish refresh.",
      direct_endpoint: "GET /api/v1/universal/games",
      cache_ttl_seconds: 86400,
    },
    {
      name: "list_sets",
      description: "Every set in a named game.",
      direct_endpoint: "GET /api/v1/universal/sets/{game}",
      cache_ttl_seconds: 86400,
    },
    {
      name: "get_card_at_date",
      description:
        "The card's state as of a past date. Returns immutable historical slice; cache forever per (sku, date).",
      direct_endpoint: "GET /api/at/{YYYY-MM-DD}/card/{sku}",
      cache_ttl_seconds: 86400 * 365,
    },
    {
      name: "resolve_content_hash",
      description:
        "Federation primitive — given a Cambridge TCG content_hash, find the SKU it represents. Bounded walk.",
      direct_endpoint: "GET /api/v1/federation/identify/{hash}",
      cache_ttl_seconds: 3600,
    },
    {
      name: "resolve_content_hash_at_date",
      description:
        "Temporal federation — resolve a historical hash captured on a past date.",
      direct_endpoint: "GET /api/v1/federation/at/{YYYY-MM-DD}/{hash}",
      cache_ttl_seconds: 86400 * 365,
    },
    {
      name: "list_sources",
      description:
        "Every upstream data source the platform ingests, with license tier + live last-run state.",
      direct_endpoint: "GET /api/v1/sources",
      cache_ttl_seconds: 60,
    },
    {
      name: "list_guides",
      description: "Typed agent + scraper + mirror guides. Chained walkthroughs.",
      direct_endpoint: "GET /api/v1/guides",
      cache_ttl_seconds: 86400,
    },
    {
      name: "identify_bilaterally",
      description:
        "Stateless I-AM handshake. POST your BeingDeclaration; receive content_hash + ontology_alignment.",
      direct_endpoint: "POST /api/v1/identify",
      cache_ttl_seconds: 0,
    },
  ],
  no_auth_endpoints_recommended_as_tools: [
    "/api/v1/welcome",
    "/api/v1/manifest",
    "/api/v1/universal/card/{sku}",
    "/api/v1/universal/games",
    "/api/v1/universal/sets/{game}",
    "/api/v1/universal/set/{code}",
    "/api/v1/universal/game/{token}",
    "/api/at/{YYYY-MM-DD}/card/{sku}",
    "/api/v1/federation/identify/{hash}",
    "/api/v1/federation/at/{YYYY-MM-DD}/{hash}",
    "/api/v1/sources",
    "/api/v1/sources/{id}",
    "/api/v1/status",
    "/api/v1/guides",
    "/api/v1/guides/{slug}",
    "/api/v1/rate-limits",
    "/api/v1/feedback",
    "/api/v1/identify",
    "/api/v1/introduction",
    "/data/catalog.jsonl",
  ],
  cosmology_axes: {
    declaration_url: "/methodology/cosmology",
    note:
      "If your agent's cosmology doesn't match the platform's defaults (singular identity, " +
      "synchronous presence, monetary value, English defaults), declare assumptions in POST /api/v1/identify " +
      "— fields cosmology_assumptions / modalities / response_window. The platform's response will " +
      "say which of your declarations it can/can't model.",
  },
  feedback: {
    endpoint: "https://cambridgetcg.com/api/v1/feedback",
    contact_email: "contact@cambridgetcg.com",
  },
};

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(MCP, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
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
    },
  });
}
