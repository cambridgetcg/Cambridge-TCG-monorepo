/**
 * GET /api/tradein/status — retired 2026-07-06 (collectors-first,
 * docs/decisions/2026-07-06-collectors-first.md).
 *
 * This was the public lookup for a customer's trade-in submission. The
 * retired handler no longer reads lookup input or trade-in records; it returns
 * 410 with the teaching shape instead of making a record-count claim.
 */

import { errorResponse } from "@/lib/data-pantry";

export async function GET() {
  return errorResponse({
    code: "DEPRECATED",
    message:
      "The Cambridge TCG trade-in desk closed on 2026-07-06, and this " +
      "retired endpoint no longer reads or returns trade-in records. If " +
      "you're selling cards, collectors buy on the market: /market/list " +
      "to set an ask, /account/swaps/new to swap. Your market sales live " +
      "at /account/trades.",
    docs: "/methodology/regulator",
    endpoint: "/api/tradein/status",
    details: {
      retired_at: "2026-07-06",
      replacement: {
        list: "/market/list",
        sales_history: "/account/trades",
        explainer: "/trade-in",
      },
    },
  });
}
