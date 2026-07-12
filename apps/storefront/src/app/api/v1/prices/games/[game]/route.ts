import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ game: string }> },
): Promise<Response> {
  const { game } = await params;
  return NextResponse.json(
    {
      error: { code: "PRICE_GUIDE_PAUSED", message: "The public price-guide catalog is paused pending affirmative membership lineage." },
      query: { game, origin: "caller-supplied" },
      catalog_membership_asserted: false,
      sets: [],
      sets_complete: false,
    },
    { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "300", "X-Content-License": "NOASSERTION" } },
  );
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Max-Age": "86400" } });
}
