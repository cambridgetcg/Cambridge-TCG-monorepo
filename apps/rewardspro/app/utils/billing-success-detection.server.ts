/**
 * Billing Success Detection
 *
 * Detects when a user has just completed a new subscription and should see a success message.
 * Uses session storage to ensure success is shown only once per subscription.
 */

import type { Session } from "@shopify/shopify-app-remix/server";

interface BillingCheckResult {
  hasActivePayment: boolean;
  appSubscriptions: Array<{
    id: string;
    name: string;
    test: boolean;
  }>;
  oneTimePurchases: Array<{
    id: string;
    name: string;
    test: boolean;
    status: string;
  }>;
}

/**
 * Detects if user just completed a new subscription
 *
 * Strategy:
 * 1. Check if they just returned from Shopify (URL param)
 * 2. Check if they have an active subscription now
 * 3. Check if we've already shown the success message (session flag)
 *
 * This ensures:
 * - Success shown only once (not on page reload)
 * - Success only shown for actual subscriptions
 * - Can't be faked with URL manipulation
 */
export async function detectNewSubscription(
  session: Session,
  billingCheck: BillingCheckResult,
  returnedFromShopify: boolean
): Promise<boolean> {
  console.log('[Success Detection] Starting detection:', {
    returnedFromShopify,
    hasActivePayment: billingCheck.hasActivePayment,
    subscriptionCount: billingCheck.appSubscriptions.length,
  });

  // Not returned from Shopify? No new subscription
  if (!returnedFromShopify) {
    console.log('[Success Detection] Not returned from Shopify - no success');
    return false;
  }

  // Returned from Shopify but no active payment? Failed or cancelled
  if (!billingCheck.hasActivePayment) {
    console.log('[Success Detection] No active payment - subscription failed or cancelled');
    return false;
  }

  // Get the most recent subscription
  const currentSubscription = billingCheck.appSubscriptions[0];

  if (!currentSubscription) {
    console.log('[Success Detection] No subscription found - no success');
    return false;
  }

  const currentSubscriptionId = currentSubscription.id;
  console.log('[Success Detection] Current subscription:', {
    id: currentSubscriptionId,
    name: currentSubscription.name,
    test: currentSubscription.test,
  });

  // Check if we've already shown success for this subscription
  const sessionData = session as any;
  const lastShownSubscriptionId = sessionData.lastShownSubscriptionId;

  console.log('[Success Detection] Last shown subscription ID:', lastShownSubscriptionId);

  // If we already showed success for this subscription, don't show again
  if (lastShownSubscriptionId === currentSubscriptionId) {
    console.log('[Success Detection] Already shown success for this subscription - no duplicate');
    return false;
  }

  // Mark this subscription as "success shown"
  try {
    const { sessionStorage } = await import("~/shopify.server");
    sessionData.lastShownSubscriptionId = currentSubscriptionId;
    await sessionStorage.storeSession(session);
    console.log('[Success Detection] Marked subscription as shown:', currentSubscriptionId);
  } catch (error) {
    console.error('[Success Detection] Failed to store session:', error);
    // Still show success even if we can't store it
    // Better to show twice than not at all
  }

  // This is a new subscription that we haven't shown success for!
  console.log('[Success Detection] ✅ New subscription detected - show success!');
  return true;
}

/**
 * Clear success flag (useful for testing or resetting state)
 */
export async function clearSuccessFlag(session: Session): Promise<void> {
  try {
    const { sessionStorage } = await import("~/shopify.server");
    const sessionData = session as any;
    delete sessionData.lastShownSubscriptionId;
    await sessionStorage.storeSession(session);
    console.log('[Success Detection] Cleared success flag');
  } catch (error) {
    console.error('[Success Detection] Failed to clear success flag:', error);
  }
}

/**
 * Get the stored subscription ID from session
 */
export function getStoredSubscriptionId(session: Session): string | undefined {
  const sessionData = session as any;
  return sessionData.lastShownSubscriptionId;
}
