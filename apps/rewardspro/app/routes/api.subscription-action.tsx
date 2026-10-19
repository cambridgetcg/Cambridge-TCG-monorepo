/**
 * Subscription Action API (pause, resume, cancel, skip)
 *
 * Paused. Recurring memberships are Shopify subscription contracts, which
 * need the own_subscription_contracts scope the app does not request, and the
 * previous handler took the shopper's identity from the unsigned request body
 * (an app proxy signs only the query string). Restore from git history only
 * with the scope granted and identity read from logged_in_customer_id.
 */

import { json } from "@remix-run/node";

const unavailableResponse = () =>
  json(
    {
      error: "Subscription actions are unavailable",
      code: "RECURRING_MEMBERSHIPS_NOT_ENABLED",
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    },
  );

export const action = unavailableResponse;
