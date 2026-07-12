import { NextResponse } from "next/server";

/** Game-ready starter resolution is paused with the public starter detail. */
export async function GET(request: Request): Promise<Response> {
  const requestedId = new URL(request.url).searchParams.get("id");
  return NextResponse.json(
    {
      error: {
        code: "STARTER_LOAD_PAUSED",
        message:
          "Starter loading is paused until decklist composition and resolved card metadata have an affirmative public lineage.",
      },
      requested_id: requestedId,
      resolved: false,
      catalog_membership_asserted: false,
      does_not_include: [
        "game-ready deck cards",
        "SKUs, names, images, rarity, or card numbers",
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
