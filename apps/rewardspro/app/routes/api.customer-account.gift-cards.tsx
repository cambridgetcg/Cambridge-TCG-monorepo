/**
 * Customer Account Gift Cards API
 *
 * Paused. Converting store credit to gift cards needs the write_gift_cards
 * scope, which the app does not request, and the previous handler looked the
 * shopper up by a caller-supplied customer_id instead of the verified session
 * token's `sub`. Restore from git history only with both fixed.
 */

import { json } from "@remix-run/node";

const unavailableResponse = () =>
  json(
    {
      error: "Customer Account gift cards are unavailable",
      code: "CUSTOMER_ACCOUNT_IDENTITY_BINDING_REQUIRED",
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    },
  );

export const loader = unavailableResponse;
export const action = unavailableResponse;
