import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ game: string; set: string; number: string }> },
): Promise<Response> {
  const { game, set, number } = await params;
  return NextResponse.json(
    {
      error: { code: "PRICE_CARD_PAUSED", message: "Public card membership and price state are paused pending affirmative lineage." },
      query: { game, set, number, origin: "caller-supplied" },
      catalog_membership_asserted: false,
      resolved: false,
      does_not_include: ["SKU or card existence", "names, rarity, images, prices, stock, source signals, dates, or history"],
    },
    { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "300", "X-Content-License": "NOASSERTION" } },
  );
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Max-Age": "86400" } });
}
