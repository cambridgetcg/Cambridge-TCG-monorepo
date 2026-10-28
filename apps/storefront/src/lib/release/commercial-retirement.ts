/** Commercial acquisition is retired. Existing obligations keep their lifecycle. */
export const NEW_PAID_COMMERCE_RETIRED = true;
export const NEW_PAID_COMMERCE_RETIRED_CODE = "NEW_PAID_COMMERCE_RETIRED";
export const NEW_PAID_COMMERCE_RETIRED_MESSAGE =
  "New paid orders, subscriptions and checkout have been retired. Existing records, settlement, cancellations and refunds remain available.";

export class NewPaidCommerceRetiredError extends Error {
  readonly code = NEW_PAID_COMMERCE_RETIRED_CODE;
  readonly status = 410;

  constructor() {
    super(NEW_PAID_COMMERCE_RETIRED_MESSAGE);
    this.name = "NewPaidCommerceRetiredError";
  }
}

/**
 * Data-API plans' own admission (Yu, 2026-10-28). It is separate from the
 * retirement above and reopens none of it: NEW_PAID_COMMERCE_RETIRED stays
 * true, and every admission it closes stays closed. It covers data-API
 * subscriptions only, which sell derived market data, and only in Stripe test
 * mode: lib/data-api/billing/config.server.ts refuses live keys and the
 * data-API webhook refuses live events. Checkout additionally stays closed
 * until DATA_API_CHECKOUT_INTAKE is "test" (lib/data-api/posture.ts), and even
 * then admits operators only (users.role = 'admin', testing the round trip):
 * on production a member paying with a Stripe test card would otherwise hold
 * a paid plan's entitlement for nothing.
 */
export const DATA_API_PAID_PLANS = Object.freeze({
  scope: "data-api-subscriptions",
  mode: "test-only",
  livePayments: false,
  decidedBy: "Yu",
  decidedOn: "2026-10-28",
  decision: "docs/decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md",
} as const);

export function newPaidCommerceRetiredResponse(): Response {
  return Response.json(
    { code: NEW_PAID_COMMERCE_RETIRED_CODE, error: NEW_PAID_COMMERCE_RETIRED_MESSAGE },
    { status: 410, headers: { "Cache-Control": "private, no-store" } },
  );
}
