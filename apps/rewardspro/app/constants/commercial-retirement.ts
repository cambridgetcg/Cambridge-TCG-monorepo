import { tryGetPlanKey } from "~/constants/pricing-contract";

/**
 * RewardsPro is free-only for now (docs/decisions/2026-10-20-rewardspro-free-only-relaunch.md):
 * no new paid subscriptions or paid plan changes; existing agreements keep their own lifecycle.
 * Merchant-facing wording says paid plans aren't offered, not that anything is retired.
 */
export const NEW_PAID_SUBSCRIPTIONS_RETIRED = true;

/**
 * For places that don't know the shop's agreement (shared gates, capacity notices, refusals).
 * It is true for every merchant: it doesn't tell someone still paying that RewardsPro is free.
 */
export const PAID_SUBSCRIPTIONS_RETIRED_MESSAGE =
  "Free Forever is the only plan offered right now. Existing subscription records, cancellation, refunds, and support remain available.";

/** For a shop with no active paid agreement. */
export const FREE_SHOP_PAID_PLANS_MESSAGE =
  "RewardsPro is free, and paid plans aren't offered right now. Records of earlier subscriptions, refunds, and support remain available.";

/** For a shop that still has an active paid agreement: it keeps paying under its own terms, so this copy never calls RewardsPro free. */
export const ACTIVE_PAID_AGREEMENT_MESSAGE =
  "Free Forever is the only plan offered right now, so paid plans can't be started or changed. Your existing subscription keeps its recorded terms, and its records, cancellation, refunds, and support remain available.";

/**
 * Whether any of the shop's active subscription names is a paid agreement. A name counts as
 * free only when it is recognised as the Free plan; an unrecognised name (a legacy plan, say)
 * counts as paid, so a paying merchant is never told RewardsPro is free.
 */
export function hasActivePaidAgreement(activePlanNames: ReadonlyArray<string | null | undefined>): boolean {
  return activePlanNames.some((name) => typeof name === "string" && name.trim() !== "" && tryGetPlanKey(name) !== "free");
}

export function paidPlansNotOfferedMessage({ hasActivePaidAgreement }: { hasActivePaidAgreement: boolean }): string {
  return hasActivePaidAgreement ? ACTIVE_PAID_AGREEMENT_MESSAGE : FREE_SHOP_PAID_PLANS_MESSAGE;
}

export const PAID_SUBSCRIPTIONS_RETIRED_STATUS = 410;

export function paidSubscriptionsRetiredResult() {
  return {
    success: false as const,
    code: "NEW_PAID_SUBSCRIPTIONS_RETIRED",
    error: PAID_SUBSCRIPTIONS_RETIRED_MESSAGE,
  };
}
