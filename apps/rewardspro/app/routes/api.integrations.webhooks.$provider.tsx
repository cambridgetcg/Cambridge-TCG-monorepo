/**
 * Third-party integration webhook status.
 *
 * This generic receiver is paused. The old provider adapters did not provide
 * one uniform, provider-accurate verification contract, so no request body is
 * read and no webhook or points data is persisted here.
 */

import { json } from "@remix-run/node";

const unavailableResponse = () =>
  json(
    {
      error: "Generic integration webhooks are unavailable",
      code: "PROVIDER_VERIFICATION_REQUIRED",
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    },
  );

export const loader = unavailableResponse;
export const action = unavailableResponse;
