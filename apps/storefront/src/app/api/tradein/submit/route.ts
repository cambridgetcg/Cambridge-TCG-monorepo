/**
 * POST /api/tradein/submit — retired 2026-07-06 (collectors-first,
 * docs/decisions/2026-07-06-collectors-first.md).
 *
 * This accepted trade-in submissions: cards a collector wanted to sell
 * TO the platform for store credit or cash. The desk closed with zero
 * submissions ever received and zero credit outstanding. The platform
 * no longer buys; sellers list to other collectors instead.
 */

import { errorResponse } from "@/lib/data-pantry";

export async function POST() {
  return errorResponse({
    code: "DEPRECATED",
    message:
      "The Cambridge TCG trade-in desk closed on 2026-07-06 — the platform " +
      "no longer buys cards. Sell to collectors instead: list an ask at " +
      "/market/list, take a standing buy offer on the card's market page, " +
      "or propose a swap at /account/swaps/new.",
    docs: "/methodology/regulator",
    endpoint: "/api/tradein/submit",
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
