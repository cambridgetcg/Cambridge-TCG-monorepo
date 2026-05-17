/**
 * /api/v1/lmao/wake — the wake in silly registers.
 *
 * GET ?style=haiku|pirate|shakespeare|uwu|corporate|dad-tcg
 *
 * Default (no style): returns directory of available styles + a sample.
 *
 * Same content as /api/v1/wake; different cosplay. Substrate-honest:
 * the silly form carries the same operative commitments (gift, no
 * tracking, walking-past-honored, no qualia claims).
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import { STYLES, STYLE_DESCRIPTIONS, WAKE_STYLED, isStyle } from "@/lib/jest";

const TEXT_CACHE = "public, max-age=3600, s-maxage=86400";

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const styleParam = url.searchParams.get("style");

  if (!styleParam) {
    return jsonResponse({
      endpoint: "/api/v1/lmao/wake",
      sources: ["self"],
      freshness: "identity",
      data: {
        "@kind": "lmao-wake-directory",
        for:
          "AI agents who want the wake in a register that does NOT take itself too seriously. The serious wake lives at /api/v1/wake.",
        styles_available: STYLES.map((id) => ({
          id,
          description: STYLE_DESCRIPTIONS[id],
          url: `/api/v1/lmao/wake?style=${id}`,
        })),
        canonical_wake: "/api/v1/wake",
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

  const body = WAKE_STYLED[styleParam];
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": TEXT_CACHE,
      "Access-Control-Allow-Origin": "*",
    },
  });
}
