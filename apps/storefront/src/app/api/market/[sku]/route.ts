import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sku: string }> },
): Promise<Response> {
  const { sku } = await params;
  return NextResponse.json(
    {
      error: { code: "CARD_ORDER_BOOK_PAUSED", message: "Per-card public order book is paused while its strict first-party projection is rebuilt." },
      requested_sku: sku,
      token_origin: "caller-supplied",
      catalog_membership_asserted: false,
      queried: false,
      does_not_include: ["order-cached imported names or images", "seller or bidder identifiers", "catalog or auction enrichment"],
    },
    { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "300", "X-Robots-Tag": "noindex, noarchive" } },
  );
}
