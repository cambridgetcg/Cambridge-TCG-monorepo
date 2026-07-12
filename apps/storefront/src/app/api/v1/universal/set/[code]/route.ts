import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await params;
  return NextResponse.json(
    {
      "@encoding": "cambridge-tcg/universal/v1",
      "@kind": "set_publication_gap",
      record_license: "NOASSERTION",
      publication_status: "withheld-untraced-lineage",
      requested_set_code: code,
      token_origin: "caller-supplied",
      catalog_membership_asserted: false,
      resolved: false,
      cards: [],
      cards_complete: false,
      does_not_include: [
        "set existence, game membership, or child card membership",
        "child SKUs or hashes",
        "names, counts, dates, images, rarity, or prices",
        "database queries",
      ],
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": "300",
        "X-Content-License": "NOASSERTION",
        "X-Schema-License": "CC0-1.0",
      },
    },
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
