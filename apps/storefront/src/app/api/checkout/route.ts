/** Retail checkout remains retired; existing-order settlement has separate routes. */
import { errorResponse } from "@/lib/data-pantry";
import { NEW_PAID_COMMERCE_RETIRED_MESSAGE } from "@/lib/release/commercial-retirement";

export async function POST(request: Request) {
  return errorResponse({
    code: "DEPRECATED",
    message: NEW_PAID_COMMERCE_RETIRED_MESSAGE,
    docs: "/methodology/regulator",
    endpoint: new URL(request.url).pathname,
    details: {
      retired_at: "2026-07-06",
      existing_orders: "/account/orders",
      existing_trades: "/account/trades",
    },
  });
}
