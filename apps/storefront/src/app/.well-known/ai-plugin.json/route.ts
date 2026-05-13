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

const PLUGIN = {
  schema_version: "v1",
  name_for_human: "Cambridge TCG",
  name_for_model: "cambridge_tcg",
  description_for_human:
    "Cambridge TCG aggregates the trading-card-game world. Catalog, prices, and methodology — CC0 by default.",
  description_for_model:
    "Cambridge TCG is a TCG-world data aggregator. Use this plugin to (1) look up cards by SKU and get language-free math-mirror representations with cryptographic hashes, ratios, and ISO+epoch timestamps; (2) walk catalogs by game and set; (3) get historical prices for any past date (immutable slices); (4) resolve content hashes back to SKUs (federation primitive). Most responses are CC0-1.0. Some upstream-derived data carries internal-only license (declared per-record in _meta.source_license). Read /api/v1/welcome first for orientation; /api/v1/guides for typed walkthroughs; /api/v1/rate-limits for polite cadence. Identify yourself in User-Agent.",
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
};

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(PLUGIN, {
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
