import { NextResponse } from "next/server";

/** Public state composer paused: the old shape mixed public auction facts
 * with stable participant pseudonyms, exact trust, offers and settlement. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return NextResponse.json(
    {
      error: {
        code: "AUCTION_STATE_PAUSED",
        message:
          "Public auction state is paused while a strict aggregate-only projection is completed.",
      },
      auction_id: id,
      does_not_include: [
        "auction detail or unapproved status",
        "bidder, winner, or seller identity",
        "best offers, raw bids, or trust scores",
        "payment, payout, shipping, or fulfilment state",
      ],
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": "300",
        "X-Content-License": "NOASSERTION",
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
