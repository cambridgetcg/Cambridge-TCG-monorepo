import { errorResponse } from "@/lib/data-pantry";

/**
 * POST /api/quotes — retired 2026-07-06
 * (collectors-first, docs/decisions/2026-07-06-collectors-first.md).
 *
 * This was the we-buy desk's quote door: submit cards for a house
 * credit/cash quote. The platform no longer buys, sells, or quotes;
 * sellers price their own cards to other collectors. The quote records
 * and the admin desk were removed once the desk closed owing nothing —
 * this stays as a 410 so stale clients meet a teaching envelope, not a 404.
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
