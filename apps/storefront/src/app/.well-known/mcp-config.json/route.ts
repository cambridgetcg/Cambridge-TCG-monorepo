/**
 * /.well-known/mcp-config.json — paste-and-go MCP config snippet.
 *
 * The smallest possible step from "I read about Cambridge TCG" to "my
 * Claude Code / MCP client has it wired in". Drop this JSON object into
 * your mcp.config.json under `mcpServers.cambridge-tcg` and restart.
 *
 * Filed for kingdom-083 — the inner peace.
 */

import { NextResponse } from "next/server";

const CONFIG = {
  /**
   * The config block, ready to paste into ~/.config/claude-code/mcp.json
   * or any MCP client's server registry. Most MCP clients use this shape.
   *
   * Usage (Claude Code):
   *   curl https://cambridgetcg.com/.well-known/mcp-config.json | \
   *     jq '.mcp_server_entry' >> ~/.config/claude-code/mcp.json
   *   (then edit to merge into your mcpServers block)
   */
  mcp_server_entry: {
    "cambridge-tcg": {
      url: "https://cambridgetcg.com/api/mcp",
      transport: "https",
      description:
        "Cambridge TCG — TCG world data aggregator. Read-tools for catalog, prices, federation, and methodology.",
      auth: {
        type: "bearer",
        provision_url: "https://cambridgetcg.com/account/agents",
        note:
          "Sign in at /account/agents to provision a bearer token. Some read-tools (universal/card, federation/identify, catalog walks) work without auth via the underlying public API — see the no_auth_alternative URLs below.",
      },
    },
  },

  /**
   * Alternative: no-auth direct-API tools. These don't require an MCP
   * server gate; the client can call /api/v1/* directly. Wire them into
   * your toolbelt as plain HTTP tools.
   */
  no_auth_alternative_tools: [
    {
      tool_name: "ctcg_get_card",
      description: "Look up a card by canonical SKU.",
      method: "GET",
      url_template: "https://cambridgetcg.com/api/v1/universal/card/{sku}",
      cache_ttl_seconds: 300,
      example_sku: "op-op01-001-ja",
    },
    {
      tool_name: "ctcg_list_games",
      description: "Every TCG game in the catalog.",
      method: "GET",
      url_template: "https://cambridgetcg.com/api/v1/universal/games",
      cache_ttl_seconds: 86400,
    },
    {
      tool_name: "ctcg_list_sets",
      description: "Every set in a named game.",
      method: "GET",
      url_template: "https://cambridgetcg.com/api/v1/universal/sets/{game}",
      cache_ttl_seconds: 86400,
    },
    {
      tool_name: "ctcg_get_card_at_date",
      description: "The card's state as of a past date.",
      method: "GET",
      url_template: "https://cambridgetcg.com/api/at/{date}/card/{sku}",
      cache_ttl_seconds: 86400 * 365,
    },
    {
      tool_name: "ctcg_resolve_content_hash",
      description: "Federation primitive — hash to SKU.",
      method: "GET",
      url_template: "https://cambridgetcg.com/api/v1/federation/identify/{hash}",
      cache_ttl_seconds: 3600,
    },
    {
      tool_name: "ctcg_list_sources",
      description: "Every ingest source with live last-run state.",
      method: "GET",
      url_template: "https://cambridgetcg.com/api/v1/sources",
      cache_ttl_seconds: 60,
    },
    {
      tool_name: "ctcg_get_welcome",
      description: "Front-door orientation document.",
      method: "GET",
      url_template: "https://cambridgetcg.com/api/v1/welcome",
      cache_ttl_seconds: 86400,
    },
  ],

  /** Recommended client-side User-Agent header. */
  recommended_user_agent:
    "<your-client>/<version> (<your-contact-email>) ctcg-mcp",

  /** First-request guide for new MCP integrators. */
  first_request_guide: "https://cambridgetcg.com/api/v1/guides/first-request",

  /** Per-endpoint canonical examples. */
  examples_directory: "https://cambridgetcg.com/api/v1/examples",

  /** Feedback channel. */
  feedback_endpoint: "https://cambridgetcg.com/api/v1/feedback",

  /** Specification version. */
  spec_version: "1",
};

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(CONFIG, {
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
