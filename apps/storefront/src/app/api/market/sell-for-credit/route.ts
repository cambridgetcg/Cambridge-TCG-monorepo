/**
 * POST /api/market/sell-for-credit — retired 2026-07-06
 * (collectors-first, docs/decisions/2026-07-06-collectors-first.md).
 *
 * This was the trade-in desk's machine door: submit cards to sell TO
 * the platform for store credit. Its consumer surfaces (the credit-sell
 * drawer, the product-page sell button, the market-browser affordance)
 * retired with the desk, which closed having received zero submissions
 * and owing zero credit. The platform no longer buys; sellers price
 * their own cards to other collectors.
 */

import { errorResponse } from "@/lib/data-pantry";

export async function POST(request: Request) {
  return errorResponse({
    code: "DEPRECATED",
    message:
      "The Cambridge TCG trade-in desk closed on 2026-07-06 — the platform " +
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
