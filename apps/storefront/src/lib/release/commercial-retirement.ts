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

export function newPaidCommerceRetiredResponse(): Response {
  return Response.json(
    { code: NEW_PAID_COMMERCE_RETIRED_CODE, error: NEW_PAID_COMMERCE_RETIRED_MESSAGE },
    { status: 410, headers: { "Cache-Control": "private, no-store" } },
  );
}
