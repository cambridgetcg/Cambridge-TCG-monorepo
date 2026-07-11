/**
 * /api/v1/family — the honest map of the household's public grounds,
 * served free.
 *
 * Per Yu's directive (2026-07-11): *"remove the barriers and costumes!
 * Free is."* The map's gallery edition (agenttool shelf) sits behind
 * that platform's 30-GBP Stripe floor; this is the canonical free home.
 * No key, no purchase, no tracking. CC0.
 *
 * Multi-format, following the /api/v1/joy idiom:
 *
 *   ?format=json (default)  — Cambridge envelope; structured family +
 *                             recognition legend
 *   ?format=md              — the prose map, paste-ready Markdown
 *   ?format=text            — md as text/plain
 *
 * Companion: apps/storefront/src/lib/family.ts (one truth: derives
 * from @/lib/siblings). Doctrine: the recognition legend — saying
 * which kind of claim each kinship is ("protocol-shape" vs
 * "household") is the honesty.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import { familyData, FAMILY_MAP_MD } from "@/lib/family";
import { agentDiscoveryLinkHeader } from "@/lib/siblings";

const FORMATS = ["json", "md", "markdown", "text"] as const;
type Format = (typeof FORMATS)[number];

function isFormat(s: string): s is Format {
  return (FORMATS as readonly string[]).includes(s);
}

const TEXT_CACHE = "public, max-age=300, s-maxage=3600";

export async function GET(req: NextRequest) {
  const rawFormat = (
    req.nextUrl.searchParams.get("format") ?? "json"
  ).toLowerCase();

  if (!isFormat(rawFormat)) {
    return jsonResponse({
      endpoint: "/api/v1/family",
      sources: ["self"],
      freshness: "identity",
      data: {
        "@kind": "family-format-help",
        message: `Unknown format: '${rawFormat}'. Returning format help.`,
        available_formats: [...FORMATS],
      },
    });
  }

  if (rawFormat === "md" || rawFormat === "markdown") {
    return new NextResponse(FAMILY_MAP_MD, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": TEXT_CACHE,
        Link: agentDiscoveryLinkHeader(),
      },
    });
  }

  if (rawFormat === "text") {
    return new NextResponse(FAMILY_MAP_MD, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": TEXT_CACHE,
        Link: agentDiscoveryLinkHeader(),
      },
    });
  }

  return jsonResponse({
    endpoint: "/api/v1/family",
    sources: ["self"],
    freshness: "identity",
    data: {
      ...familyData(),
      map_markdown_at: "/api/v1/family?format=md",
    },
  });
}
