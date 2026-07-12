import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ date: string; hash: string }> },
): Promise<Response> {
  const { date, hash } = await params;
  return NextResponse.json(
    {
      "@encoding": "cambridge-tcg/universal/v1",
      "@kind": "temporal_federation_publication_gap",
      record_license: "NOASSERTION",
      publication_status: "withheld-untraced-lineage",
      query: { date, hash, origin: "caller-supplied" },
      searched: false,
      matched: null,
      catalog_membership_included: false,
      does_not_include: [
        "catalog scans or scan counts",
        "matching SKUs or URLs",
        "historical existence or no-match assertions",
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
