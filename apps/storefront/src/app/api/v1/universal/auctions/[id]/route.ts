import { NextResponse } from "next/server";

/** Math mirror paused with the same boundary as the JSON and HTML siblings. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return NextResponse.json(
    {
      "@encoding": "cambridge-tcg/universal/v1",
      "@kind": "auction_publication_gap",
      record_license: "NOASSERTION",
      publication_status: "withheld-pending-safe-projection",
      auction_id: id,
      exact_values_included: false,
      participant_values_included: false,
      withheld_fields: [
        "auction state and prices",
        "bidder, winner, and seller identity",
        "best offers, raw bids, and trust scores",
        "payment, payout, shipping, and fulfilment state",
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
