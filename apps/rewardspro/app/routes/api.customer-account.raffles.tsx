/**
 * Customer Account Raffles API
 *
 * Paused until a Shopify Customer Account session token is verified and its
 * customer identity is bound to the requested shop and RewardsPro customer.
 * Caller-supplied query parameters, headers, and body fields are not identity.
 */

import { json } from "@remix-run/node";

const unavailableResponse = () =>
  json(
    {
      error: "Customer Account raffles are unavailable",
      code: "CUSTOMER_ACCOUNT_IDENTITY_BINDING_REQUIRED",
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    },
  );

export const loader = unavailableResponse;
export const action = unavailableResponse;
