import { NextResponse } from "next/server";

/** Public starter detail is paused: neither upstream decklist composition nor
 * wholesale-resolved card fields has an affirmative redistribution basis. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return NextResponse.json(
    {
      error: {
        code: "STARTER_DETAIL_PAUSED",
        message:
          "Starter detail is paused until decklist composition and card metadata have an affirmative public lineage.",
      },
      requested_id: id,
      catalog_membership_asserted: false,
      resolved: false,
      does_not_include: [
        "starter product, leader, color, or decklist facts",
        "card numbers, SKUs, names, images, rarity, or set metadata",
        "wholesale lookups",
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
