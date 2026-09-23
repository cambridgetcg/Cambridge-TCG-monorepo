/** New paid agreements are retired; existing agreements keep their own lifecycle. */
export const NEW_PAID_SUBSCRIPTIONS_RETIRED = true;

export const PAID_SUBSCRIPTIONS_RETIRED_MESSAGE =
  "New paid subscriptions and paid plan changes have been retired. Existing subscription records, cancellation, refunds, and support remain available.";

export const PAID_SUBSCRIPTIONS_RETIRED_STATUS = 410;

export function paidSubscriptionsRetiredResult() {
  return {
    success: false as const,
    code: "NEW_PAID_SUBSCRIPTIONS_RETIRED",
    error: PAID_SUBSCRIPTIONS_RETIRED_MESSAGE,
  };
}
