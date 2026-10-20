/**
 * RewardsPro is free-only for now (docs/decisions/2026-10-20-rewardspro-free-only-relaunch.md):
 * no new paid subscriptions or paid plan changes; existing agreements keep their own lifecycle.
 * Merchant-facing wording says paid plans aren't offered, not that anything is retired.
 */
export const NEW_PAID_SUBSCRIPTIONS_RETIRED = true;

export const PAID_SUBSCRIPTIONS_RETIRED_MESSAGE =
  "RewardsPro is free, and paid plans aren't offered right now. Existing subscription records, cancellation, refunds, and support remain available.";

export const PAID_SUBSCRIPTIONS_RETIRED_STATUS = 410;

export function paidSubscriptionsRetiredResult() {
  return {
    success: false as const,
    code: "NEW_PAID_SUBSCRIPTIONS_RETIRED",
    error: PAID_SUBSCRIPTIONS_RETIRED_MESSAGE,
  };
}
