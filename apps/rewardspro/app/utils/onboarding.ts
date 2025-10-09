import db from "~/db.server";

/**
 * Onboarding progress tracking utility
 *
 * This module provides functions to automatically track merchant onboarding progress
 * across various app features. The onboarding checklist helps merchants set up their
 * rewards program correctly.
 */

// ============================================
// TYPE DEFINITIONS
// ============================================

export type OnboardingStep =
  | 'syncedOrders'
  | 'createdTiers'
  | 'syncedCustomers'
  | 'configuredSettings';

export interface OnboardingUpdateOptions {
  shop: string;
  step: OnboardingStep;
  completed?: boolean;
}

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Update a single onboarding step
 *
 * @param shop - The shop domain
 * @param step - The onboarding step to update
 * @param completed - Whether the step is completed (default: true)
 */
export async function updateOnboardingProgress(
  shop: string,
  step: OnboardingStep,
  completed: boolean = true
): Promise<void> {
  try {
    // Build the update object dynamically
    const updateData: Record<string, boolean> = {};

    switch (step) {
      case 'syncedOrders':
        updateData.onboardingSyncedOrders = completed;
        break;
      case 'createdTiers':
        updateData.onboardingCreatedTiers = completed;
        break;
      case 'syncedCustomers':
        updateData.onboardingSyncedCustomers = completed;
        break;
      case 'configuredSettings':
        updateData.onboardingConfiguredSettings = completed;
        break;
    }

    // Update shop settings
    await db.shopSettings.upsert({
      where: { shop },
      update: updateData,
      create: {
        id: crypto.randomUUID(),
        shop,
        storeName: shop,
        storeUrl: `https://${shop}`,
        ...updateData,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log(`[Onboarding] Updated ${step} to ${completed} for shop ${shop}`);
  } catch (error) {
    console.error(`[Onboarding] Failed to update ${step} for ${shop}:`, error);
    // Don't throw - onboarding tracking is non-critical
  }
}

/**
 * Mark multiple onboarding steps as complete
 *
 * @param shop - The shop domain
 * @param steps - Array of steps to mark as complete
 */
export async function updateMultipleSteps(
  shop: string,
  steps: OnboardingStep[]
): Promise<void> {
  try {
    const updateData: Record<string, boolean> = {};

    steps.forEach(step => {
      switch (step) {
        case 'syncedOrders':
          updateData.onboardingSyncedOrders = true;
          break;
        case 'createdTiers':
          updateData.onboardingCreatedTiers = true;
          break;
        case 'syncedCustomers':
          updateData.onboardingSyncedCustomers = true;
          break;
        case 'configuredSettings':
          updateData.onboardingConfiguredSettings = true;
          break;
      }
    });

    await db.shopSettings.upsert({
      where: { shop },
      update: updateData,
      create: {
        id: crypto.randomUUID(),
        shop,
        storeName: shop,
        storeUrl: `https://${shop}`,
        ...updateData,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log(`[Onboarding] Updated multiple steps for shop ${shop}:`, steps);
  } catch (error) {
    console.error(`[Onboarding] Failed to update multiple steps for ${shop}:`, error);
  }
}

/**
 * Check if all onboarding steps are complete
 *
 * @param shop - The shop domain
 * @returns True if all steps are complete
 */
export async function isOnboardingComplete(shop: string): Promise<boolean> {
  try {
    const settings = await db.shopSettings.findUnique({
      where: { shop },
      select: {
        onboardingSyncedOrders: true,
        onboardingCreatedTiers: true,
        onboardingSyncedCustomers: true,
        onboardingConfiguredSettings: true,
      },
    });

    if (!settings) return false;

    return (
      settings.onboardingSyncedOrders &&
      settings.onboardingCreatedTiers &&
      settings.onboardingSyncedCustomers &&
      settings.onboardingConfiguredSettings
    );
  } catch (error) {
    console.error(`[Onboarding] Failed to check completion for ${shop}:`, error);
    return false;
  }
}

/**
 * Mark entire onboarding as complete
 *
 * @param shop - The shop domain
 */
export async function completeOnboarding(shop: string): Promise<void> {
  try {
    await db.shopSettings.update({
      where: { shop },
      data: { onboardingCompleted: true },
    });

    console.log(`[Onboarding] Marked onboarding as complete for shop ${shop}`);
  } catch (error) {
    console.error(`[Onboarding] Failed to complete onboarding for ${shop}:`, error);
  }
}

/**
 * Reset onboarding progress (useful for testing)
 *
 * @param shop - The shop domain
 */
export async function resetOnboarding(shop: string): Promise<void> {
  try {
    await db.shopSettings.update({
      where: { shop },
      data: {
        onboardingSyncedOrders: false,
        onboardingCreatedTiers: false,
        onboardingSyncedCustomers: false,
        onboardingConfiguredSettings: false,
        onboardingCompleted: false,
        onboardingDismissed: false,
      },
    });

    console.log(`[Onboarding] Reset onboarding progress for shop ${shop}`);
  } catch (error) {
    console.error(`[Onboarding] Failed to reset onboarding for ${shop}:`, error);
  }
}

// ============================================
// HELPER FUNCTIONS FOR SPECIFIC FEATURES
// ============================================

/**
 * Call this when customers are synced from Shopify
 */
export async function markCustomersSynced(shop: string): Promise<void> {
  return updateOnboardingProgress(shop, 'syncedCustomers');
}

/**
 * Call this when orders are synced from Shopify
 */
export async function markOrdersSynced(shop: string): Promise<void> {
  return updateOnboardingProgress(shop, 'syncedOrders');
}

/**
 * Call this when tier products are created
 */
export async function markTiersCreated(shop: string): Promise<void> {
  return updateOnboardingProgress(shop, 'createdTiers');
}

/**
 * Call this when store settings are configured (currency, etc.)
 */
export async function markSettingsConfigured(shop: string): Promise<void> {
  return updateOnboardingProgress(shop, 'configuredSettings');
}
