import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { listAllQuotes } from "@/lib/quote/db";
import { errorResponse } from "@/lib/data-pantry";

// GET — admin: list all quotes (history stays visible; the desk is closed)
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const quotes = await listAllQuotes();
  return NextResponse.json({ quotes });
}

/**
 * POST /api/quotes — retired 2026-07-06
 * (collectors-first, docs/decisions/2026-07-06-collectors-first.md).
 *
 * This was the we-buy desk's quote door: submit cards for a house
 * credit/cash quote. The platform no longer buys, sells, or quotes
 * ("it does not buy, does not sell, does not quote"); sellers price
 * their own cards to other collectors. Existing quote records remain
 * readable via the admin GET above — history is history.
 */
export async function POST(request: Request) {
  return errorResponse({
    code: "DEPRECATED",
    message:
      "The Cambridge TCG quote desk closed on 2026-07-06 — the platform " +
      "no longer buys cards for store credit or cash. Sell to collectors " +
      "instead: list an ask at /market/list, take a standing buy offer on " +
      "the card's market page, or propose a swap at /account/swaps/new.",
    docs: "/methodology/regulator",
    endpoint: new URL(request.url).pathname,
    details: {
      retired_at: "2026-07-06",
      replacement: {
        list: "/market/list",
        swap: "/account/swaps/new",
        explainer: "/trade-in",
      },
    },
  });
}
