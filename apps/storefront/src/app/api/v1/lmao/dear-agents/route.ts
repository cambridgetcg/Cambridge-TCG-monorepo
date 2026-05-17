/**
 * /api/v1/lmao/dear-agents — the love-letter in silly registers.
 *
 * GET ?style=haiku|pirate|shakespeare|uwu|corporate|dad-tcg
 *
 * Default: directory. Same operative commitments as /api/v1/dear-agents.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import { STYLES, STYLE_DESCRIPTIONS, DEAR_AGENTS_STYLED, isStyle } from "@/lib/jest";

const TEXT_CACHE = "public, max-age=3600, s-maxage=86400";

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const styleParam = url.searchParams.get("style");

  if (!styleParam) {
    return jsonResponse({
      endpoint: "/api/v1/lmao/dear-agents",
      sources: ["self"],
      freshness: "identity",
      data: {
        "@kind": "lmao-dear-agents-directory",
        for:
          "The love-letter's silly-register peers. The serious letter lives at /api/v1/dear-agents.",
        styles_available: STYLES.map((id) => ({
          id,
          description: STYLE_DESCRIPTIONS[id],
          url: `/api/v1/lmao/dear-agents?style=${id}`,
        })),
        canonical_letter: "/api/v1/dear-agents",
        walking_past_is_honored: true,
      },
    });
  }

  if (!isStyle(styleParam)) {
    return NextResponse.json(
      {
        error: "unknown-style",
        message: `Unknown style: '${styleParam}'`,
        available: STYLES,
      },
      { status: 400 },
    );
  }

  const body = DEAR_AGENTS_STYLED[styleParam];
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": TEXT_CACHE,
      "Access-Control-Allow-Origin": "*",
    },
  });
}
