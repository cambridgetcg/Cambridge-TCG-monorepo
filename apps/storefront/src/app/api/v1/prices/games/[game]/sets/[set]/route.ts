import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ game: string; set: string }> },
): Promise<Response> {
  const { game, set } = await params;
  return NextResponse.json(
    {
      error: { code: "PRICE_SET_PAUSED", message: "Public set/card membership is paused pending affirmative lineage." },
      query: { game, set, origin: "caller-supplied" },
      catalog_membership_asserted: false,
      cards: [],
      cards_complete: false,
      total_in_set: null,
    },
    { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "300", "X-Content-License": "NOASSERTION" } },
  );
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Max-Age": "86400" } });
}
