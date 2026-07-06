/**
 * /api/tradein/quote — retired 2026-07-06 (collectors-first,
 * docs/decisions/2026-07-06-collectors-first.md).
 *
 * POST was the admin side of the desk (compose + email a quotation);
 * PATCH was the customer accepting or declining it. Zero submissions
 * were ever received, so no quote was ever issued and none can exist
 * to accept. Both verbs answer 410 with the same teaching shape.
 */

import { errorResponse } from "@/lib/data-pantry";

function gone() {
  return errorResponse({
    code: "DEPRECATED",
    message:
      "The Cambridge TCG trade-in desk closed on 2026-07-06 — the platform " +
      "no longer buys cards, so no trade-in quote can be issued or accepted. " +
      "Sellers price their own cards on the collectors' market: /market/list " +
      "to ask, /account/swaps/new to swap.",
    docs: "/methodology/regulator",
    endpoint: "/api/tradein/quote",
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

export async function POST() {
  return gone();
}

export async function PATCH() {
  return gone();
}
