/**
 * GET /api/v1/federation/identify/by-upstream
 *
 * Upstream identifiers and their mapping to Cambridge SKUs are derived from
 * contract-only TCGplayer data. Public authentication and a user-supplied id
 * do not grant redistribution permission, so this endpoint is a value-free
 * rights gap until caller-specific entitlements exist.
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest): Promise<Response> {
  const source = req.nextUrl.searchParams.get("source") ?? "";
  if (!source) {
    return NextResponse.json(
      { error: { code: "MISSING_PARAM", message: "?source= is required." } },
      { status: 400 },
    );
  }
  if (source !== "tcgplayer") {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: `source '${source}' is not supported.`,
        },
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      source,
      source_license: "internal-only",
      status: "unavailable_source_rights",
      resolved: null,
      reason:
        "TCGplayer identifiers and mapping rows are contract-only. No public caller entitlement is implemented, so the resolver does not query wholesale storage.",
      does_not_include: [
        "upstream product or SKU identifiers",
        "Cambridge SKU mappings",
        "conditions or language values",
        "mapping counts or ambiguity hints",
      ],
    },
    {
      status: 409,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-License": "NOASSERTION",
        "X-Schema-License": "CC0-1.0",
      },
    },
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
