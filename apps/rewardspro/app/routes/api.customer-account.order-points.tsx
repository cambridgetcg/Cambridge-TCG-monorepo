/**
 * Customer Account API - Order Points Endpoint
 *
 * DEPRECATED: Points are no longer earned from orders.
 * Points are now earned exclusively from activities (challenges, missions, streaks).
 * This endpoint is kept for backward compatibility with storefront code.
 */

import { json, type LoaderFunctionArgs } from "@remix-run/node";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");

  return json({
    orderId,
    pointsEarned: 0,
    message: "Points are earned from activities, not purchases",
  });
}
