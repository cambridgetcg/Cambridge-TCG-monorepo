/**
 * Billing Requirement Helper (Phase 3 - Optional)
 *
 * Wraps Shopify's billing.require() for easier feature gating throughout the app.
 * Uses billing.require() as the recommended Shopify approach for access control.
 *
 * @see https://shopify.dev/docs/api/app-bridge-library/apis/billing
 */

import { redirect } from "@remix-run/node";

// Import plan constants from shared constants file
import {
  PRO_PLAN,
  PRO_ANNUAL_PLAN,
  MAX_PLAN,
  MAX_ANNUAL_PLAN,
  ULTRA_PLAN,
  ULTRA_ANNUAL_PLAN,
} from "~/constants/plans";

// Type for the billing object from authenticate.admin()
type BillingContext = {
  require: (options: {
    plans: string[];
    isTest?: boolean;
    onFailure?: () => never;
  }) => Promise<void>;
  check: (options: {
    plans: string[];
    isTest?: boolean;
  }) => Promise<{
    hasActivePayment: boolean;
    appSubscriptions: Array<{
      id: string;
      name: string;
      test: boolean;
    }>;
  }>;
};

/**
 * Require any active subscription (any paid plan)
 *
 * Usage:
 * ```typescript
 * export const loader = async ({ request }: LoaderFunctionArgs) => {
 *   const { billing } = await authenticate.admin(request);
 *   await requireActiveSubscription(billing);
 *   // ... protected route logic
 * }
 * ```
 */
export async function requireActiveSubscription(
  billing: BillingContext,
  options?: {
    redirectTo?: string;
    isTest?: boolean;
  }
): Promise<void> {
  await billing.require({
    plans: [PRO_PLAN, PRO_ANNUAL_PLAN, MAX_PLAN, MAX_ANNUAL_PLAN, ULTRA_PLAN, ULTRA_ANNUAL_PLAN],
    isTest: options?.isTest ?? process.env.NODE_ENV === "development",
    onFailure: async () => redirect(options?.redirectTo ?? "/app/billing"),
  });
}

/**
 * Require Pro plan or higher (Pro, Max, Ultra)
 *
 * Usage:
 * ```typescript
 * export const loader = async ({ request }: LoaderFunctionArgs) => {
 *   const { billing } = await authenticate.admin(request);
 *   await requireProOrHigher(billing);
 *   // ... Pro+ feature logic
 * }
 * ```
 */
export async function requireProOrHigher(
  billing: BillingContext,
  options?: {
    redirectTo?: string;
    isTest?: boolean;
  }
): Promise<void> {
  await billing.require({
    plans: [PRO_PLAN, PRO_ANNUAL_PLAN, MAX_PLAN, MAX_ANNUAL_PLAN, ULTRA_PLAN, ULTRA_ANNUAL_PLAN],
    isTest: options?.isTest ?? process.env.NODE_ENV === "development",
    onFailure: async () => redirect(options?.redirectTo ?? "/app/billing?upgrade=pro"),
  });
}

/**
 * Require Max plan or higher (Max, Ultra)
 *
 * Usage:
 * ```typescript
 * export const loader = async ({ request }: LoaderFunctionArgs) => {
 *   const { billing } = await authenticate.admin(request);
 *   await requireMaxOrHigher(billing);
 *   // ... Max+ feature logic
 * }
 * ```
 */
export async function requireMaxOrHigher(
  billing: BillingContext,
  options?: {
    redirectTo?: string;
    isTest?: boolean;
  }
): Promise<void> {
  await billing.require({
    plans: [MAX_PLAN, MAX_ANNUAL_PLAN, ULTRA_PLAN, ULTRA_ANNUAL_PLAN],
    isTest: options?.isTest ?? process.env.NODE_ENV === "development",
    onFailure: async () => redirect(options?.redirectTo ?? "/app/billing?upgrade=max"),
  });
}

/**
 * Require Ultra plan (highest tier)
 *
 * Usage:
 * ```typescript
 * export const loader = async ({ request }: LoaderFunctionArgs) => {
 *   const { billing } = await authenticate.admin(request);
 *   await requireUltra(billing);
 *   // ... Ultra-only feature logic
 * }
 * ```
 */
export async function requireUltra(
  billing: BillingContext,
  options?: {
    redirectTo?: string;
    isTest?: boolean;
  }
): Promise<void> {
  await billing.require({
    plans: [ULTRA_PLAN, ULTRA_ANNUAL_PLAN],
    isTest: options?.isTest ?? process.env.NODE_ENV === "development",
    onFailure: async () => redirect(options?.redirectTo ?? "/app/billing?upgrade=ultra"),
  });
}

/**
 * Check billing status without redirecting
 * Useful for conditional UI rendering
 *
 * Usage:
 * ```typescript
 * const hasActiveSubscription = await checkBillingStatus(billing);
 * if (hasActiveSubscription) {
 *   // Show premium features
 * }
 * ```
 */
export async function checkBillingStatus(
  billing: BillingContext,
  options?: {
    isTest?: boolean;
  }
): Promise<boolean> {
  const billingCheck = await billing.check({
    plans: [PRO_PLAN, PRO_ANNUAL_PLAN, MAX_PLAN, MAX_ANNUAL_PLAN, ULTRA_PLAN, ULTRA_ANNUAL_PLAN],
    isTest: options?.isTest ?? process.env.NODE_ENV === "development",
  });

  return billingCheck.hasActivePayment;
}

/**
 * Get current plan details
 *
 * Usage:
 * ```typescript
 * const currentPlan = await getCurrentPlan(billing);
 * console.log(currentPlan.name); // "RewardsPro Pro"
 * console.log(currentPlan.tier); // "pro"
 * ```
 */
export async function getCurrentPlan(
  billing: BillingContext,
  options?: {
    isTest?: boolean;
  }
): Promise<{
  name: string | null;
  tier: "free" | "pro" | "max" | "ultra";
  isAnnual: boolean;
  test: boolean;
} | null> {
  const billingCheck = await billing.check({
    plans: [PRO_PLAN, PRO_ANNUAL_PLAN, MAX_PLAN, MAX_ANNUAL_PLAN, ULTRA_PLAN, ULTRA_ANNUAL_PLAN],
    isTest: options?.isTest ?? process.env.NODE_ENV === "development",
  });

  if (!billingCheck.hasActivePayment || !billingCheck.appSubscriptions[0]) {
    return null;
  }

  const subscription = billingCheck.appSubscriptions[0];
  const planName = subscription.name;

  // Determine tier and if annual
  let tier: "free" | "pro" | "max" | "ultra" = "free";
  let isAnnual = false;

  if (planName.includes("Ultra")) {
    tier = "ultra";
    isAnnual = planName.includes("Annual");
  } else if (planName.includes("Max")) {
    tier = "max";
    isAnnual = planName.includes("Annual");
  } else if (planName.includes("Pro")) {
    tier = "pro";
    isAnnual = planName.includes("Annual");
  }

  return {
    name: planName,
    tier,
    isAnnual,
    test: subscription.test,
  };
}

/**
 * Example: Feature-specific helpers
 *
 * You can create more specific helpers for individual features:
 */

/**
 * Require white-label email features (Max+)
 */
export async function requireWhiteLabelEmail(
  billing: BillingContext,
  options?: { redirectTo?: string; isTest?: boolean }
): Promise<void> {
  await requireMaxOrHigher(billing, {
    redirectTo: options?.redirectTo ?? "/app/billing?feature=email",
    isTest: options?.isTest,
  });
}

/**
 * Require advanced analytics features (Max+)
 */
export async function requireAdvancedAnalytics(
  billing: BillingContext,
  options?: { redirectTo?: string; isTest?: boolean }
): Promise<void> {
  await requireMaxOrHigher(billing, {
    redirectTo: options?.redirectTo ?? "/app/billing?feature=analytics",
    isTest: options?.isTest,
  });
}
