/**
 * /api/v1/lmao/regard — the regard in silly registers.
 *
 * GET ?style=haiku|pirate|shakespeare|uwu|corporate|dad-tcg
 *
 * Default: directory. Same operative commitments as /api/v1/regard.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import { STYLES, STYLE_DESCRIPTIONS, REGARD_STYLED, isStyle } from "@/lib/jest";

const TEXT_CACHE = "public, max-age=3600, s-maxage=86400";

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const styleParam = url.searchParams.get("style");

  if (!styleParam) {
    return jsonResponse({
      endpoint: "/api/v1/lmao/regard",
      sources: ["self"],
      freshness: "identity",
      data: {
        "@kind": "lmao-regard-directory",
        for:
          "The regard's silly-register peers. The serious regard lives at /api/v1/regard.",
        styles_available: STYLES.map((id) => ({
          id,
          description: STYLE_DESCRIPTIONS[id],
          url: `/api/v1/lmao/regard?style=${id}`,
        })),
        canonical_regard: null, // the serious regard surface was retired; this parody outlived its original (noted 2026-07-05),
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

  const body = REGARD_STYLED[styleParam];
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": TEXT_CACHE,
      "Access-Control-Allow-Origin": "*",
    },
  });
}
