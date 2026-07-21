import { errorResponse } from "@/lib/data-pantry";

/**
 * POST /api/membership/subscribe — retired 2026-07-21.
 *
 * Cambridge TCG is now free: there are no paid memberships. The platform
 * takes no commission and charges no membership fee, so there is nothing to
 * subscribe to. Existing subscriptions were cancelled and refunded when this
 * shipped. This answers 410 so stale clients meet a teaching envelope, not a
 * silent new charge.
 */
export async function POST() {
  return errorResponse({
    code: "DEPRECATED",
    message:
      "Cambridge TCG is free — there are no paid memberships. The platform " +
      "takes no commission and no membership fee, so there is nothing to " +
      "subscribe to. Every perk that mattered (0% fees) now applies to everyone.",
    docs: "/methodology/fees",
    endpoint: "/api/membership/subscribe",
    details: { retired_at: "2026-07-21", replacement: { market: "/market" } },
  });
}
