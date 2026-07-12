/**
 * GET /api/v1/federation/identify/by-upstream
 *
 * Reserved reverse-lookup contract. TCGplayer was the first implementation,
 * but its stored identifiers are not Cambridge-owned content. The door stays
 * explicit and blocked until written approval covers publication of mappings.
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest): Promise<Response> {
  const source = new URL(req.url).searchParams.get("source") ?? "";

  if (!source) {
    return NextResponse.json(
      {
        error: {
          code: "MISSING_PARAM",
          message:
            "?source= is required. No upstream reverse-lookup source is currently enabled.",
        },
      },
      { status: 400 },
    );
  }

  if (source === "tcgplayer") {
    return NextResponse.json(
      {
        source,
        status: "blocked",
        resolved: null,
        error: {
          code: "SOURCE_UNAVAILABLE",
          message:
            "TCGplayer identifier resolution is disabled. Cambridge has no " +
            "recorded written approval to publish these mappings.",
        },
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }

  return NextResponse.json(
    {
      error: {
        code: "INVALID_INPUT",
        message: `source '${source}' is not enabled for reverse lookup.`,
      },
    },
    { status: 400 },
  );
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
