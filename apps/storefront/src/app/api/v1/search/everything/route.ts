/**
 * GET /api/v1/search/everything — temporarily paused.
 *
 * The former convenience route amplified one anonymous request into many
 * wholesale calls and built a self-fetch origin from caller-controlled Host
 * headers. Keep it fail-closed until a single bounded local composer replaces
 * that fan-out.
 */

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      error: {
        code: "ENDPOINT_PAUSED",
        message:
          "Search-everything is paused while its composer is rebuilt as one bounded local query.",
      },
      alternatives: [],
      alternatives_note:
        "No public catalog-membership resolver is currently available. Search/cards and card/everything are paused under the same rights boundary.",
      does_not_include: [
        "upstream fetches",
        "self-fetches",
        "caller-controlled origins",
        "restricted catalog or price values",
      ],
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "Retry-After": "300",
        "X-Content-License": "NOASSERTION",
      },
    },
  );
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
