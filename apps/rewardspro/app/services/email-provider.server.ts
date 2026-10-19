/**
 * Email Provider Abstraction
 *
 * Unified interface for email providers (SendGrid, Klaviyo).
 * Allows seamless switching between providers based on shop settings.
 */

import prisma from "~/db.server";
import type { EmailProvider as EmailProviderEnum, Tier, Customer } from "@prisma/client";
import {
  sendWelcomeEmail as sendGridWelcomeEmail,
  sendTierUpgradeEmail as sendGridTierUpgradeEmail,
} from "./sendgrid.server";
import { isKlaviyoEnabled } from "./klaviyo.server";
import {
  trackCustomerEnrolled,
  trackTierUpgraded,
  trackOrderPlaced,
  trackCashbackEarned,
  syncCustomerToKlaviyo,
} from "./klaviyo-events.server";
import {
  checkEmailLimit,
  recordEmailSent,
} from "./email-usage-control.server";

// ============================================
// TYPES
// ============================================

export interface WelcomeEmailParams {
  customer: Customer & { currentTier?: Tier | null };
  storeName: string;
  tierName?: string;
  cashbackPercent?: number;
}

export interface TierUpgradeEmailParams {
  customer: Customer;
  previousTier: Tier | null;
  newTier: Tier;
  qualifyingOrderId?: string;
}

// ============================================
// PROVIDER DETECTION
// ============================================

/**
 * Get the email provider for a shop
 */
export async function getEmailProviderType(
  shop: string
): Promise<EmailProviderEnum> {
  const settings = await prisma.emailSettings.findUnique({
    where: { shop },
    select: { emailProvider: true },
  });

  return settings?.emailProvider || "SENDGRID";
}

/**
 * Check if Klaviyo should handle marketing emails for this shop
 */
export async function shouldUseKlaviyoForMarketing(shop: string): Promise<boolean> {
  const settings = await prisma.emailSettings.findUnique({
    where: { shop },
    select: { emailProvider: true, klaviyoEnabled: true, klaviyoApiKey: true },
  });

  if (!settings) return false;

  return (
    (settings.emailProvider === "KLAVIYO" || settings.emailProvider === "HYBRID") &&
    settings.klaviyoEnabled &&
    !!settings.klaviyoApiKey
  );
}

/**
 * Check if SendGrid should handle transactional emails for this shop
 */
export async function shouldUseSendGridForTransactional(
  shop: string
): Promise<boolean> {
  const settings = await prisma.emailSettings.findUnique({
    where: { shop },
    select: { emailProvider: true },
  });

  return (
    settings?.emailProvider === "SENDGRID" ||
    settings?.emailProvider === "HYBRID"
  );
}

// ============================================
// UNIFIED EMAIL OPERATIONS
// ============================================

async function reportEmailCapacity(
  shop: string,
  count: number,
): Promise<void> {
  const usage = await checkEmailLimit(shop, count);

  if (usage.capacityExceeded) {
    console.warn(`[EmailProvider] ${usage.message}`);
  }
}

/**
 * Send welcome email based on provider settings
 */
export async function sendWelcomeEmailUnified(
  shop: string,
  params: WelcomeEmailParams
): Promise<boolean> {
  await reportEmailCapacity(shop, 1);

  const { customer, tierName, cashbackPercent } = params;
  const providerType = await getEmailProviderType(shop);

  // Always sync to Klaviyo if enabled (for both KLAVIYO and HYBRID modes)
  if (await isKlaviyoEnabled(shop)) {
    // Get tiers for profile properties
    const tiers = await prisma.tier.findMany({
      where: { shop },
      orderBy: { minSpend: "asc" },
    });

    // Sync profile to Klaviyo
    await syncCustomerToKlaviyo(shop, customer, tiers);

    // Track enrollment event (triggers Klaviyo flow)
    await trackCustomerEnrolled(shop, customer, "account_page");
  }

  // For pure Klaviyo mode, the flow handles the email
  if (providerType === "KLAVIYO") {
    // Record the email (Klaviyo flow will send it)
    await recordEmailSent(shop, 1, "transactional");
    return true;
  }

  // For SENDGRID and HYBRID modes, also send via SendGrid
  try {
    const settings = await prisma.emailSettings.findUnique({
      where: { shop },
    });

    if (!settings) {
      console.error("[EmailProvider] No email settings found for shop:", shop);
      return false;
    }

    await sendGridWelcomeEmail(shop, {
      email: customer.email,
      firstName: customer.firstName || undefined,
    }, {
      name: tierName || customer.currentTier?.name || "Member",
      cashbackPercent: cashbackPercent || customer.currentTier?.cashbackPercent || 0,
    });

    // Record successful email send
    await recordEmailSent(shop, 1, "transactional");
    return true;
  } catch (error) {
    console.error("[EmailProvider] Failed to send welcome email:", error);
    return false;
  }
}

/**
 * Send tier upgrade email based on provider settings
 */
export async function sendTierUpgradeEmailUnified(
  shop: string,
  params: TierUpgradeEmailParams
): Promise<boolean> {
  await reportEmailCapacity(shop, 1);

  const { customer, previousTier, newTier, qualifyingOrderId } = params;
  const providerType = await getEmailProviderType(shop);

  // Always sync to Klaviyo if enabled
  if (await isKlaviyoEnabled(shop)) {
    const tiers = await prisma.tier.findMany({
      where: { shop },
      orderBy: { minSpend: "asc" },
    });

    // Get customer with tier for sync
    const customerWithTier = {
      ...customer,
      currentTier: newTier,
    };

    // Sync profile to Klaviyo
    await syncCustomerToKlaviyo(shop, customerWithTier, tiers);

    // Track tier upgrade event (triggers Klaviyo flow)
    await trackTierUpgraded(
      shop,
      customer,
      previousTier,
      newTier,
      qualifyingOrderId,
      tiers
    );
  }

  // For pure Klaviyo mode, the flow handles the email
  if (providerType === "KLAVIYO") {
    // Record the email (Klaviyo flow will send it)
    await recordEmailSent(shop, 1, "transactional");
    return true;
  }

  // For SENDGRID and HYBRID modes, also send via SendGrid
  try {
    const settings = await prisma.emailSettings.findUnique({
      where: { shop },
    });

    if (!settings) {
      return false;
    }

    await sendGridTierUpgradeEmail(shop, {
      email: customer.email,
      firstName: customer.firstName || undefined,
    }, {
      previousTier: previousTier?.name || "None",
      newTier: newTier.name,
      newCashbackPercent: Number(newTier.cashbackPercent),
    });

    // Record successful email send
    await recordEmailSent(shop, 1, "transactional");
    return true;
  } catch (error) {
    console.error("[EmailProvider] Failed to send tier upgrade email:", error);
    return false;
  }
}

/**
 * Track order for Klaviyo (if enabled)
 * This syncs the order event to Klaviyo for flow triggers
 */
export async function trackOrderForKlaviyo(
  shop: string,
  customer: Customer & { currentTier?: Tier | null },
  order: {
    id: string;
    orderNumber?: string;
    totalPrice: number;
    cashbackEarned: number;
    cashbackUsed: number;
    currency?: string;
    discountCode?: string;
    lineItems?: Array<{
      productId?: string;
      sku?: string;
      title: string;
      quantity: number;
      price: number;
      imageUrl?: string;
      productUrl?: string;
    }>;
  }
): Promise<boolean> {
  if (!(await isKlaviyoEnabled(shop))) {
    return false;
  }

  const tiers = await prisma.tier.findMany({
    where: { shop },
    orderBy: { minSpend: "asc" },
  });

  // Sync profile first
  await syncCustomerToKlaviyo(shop, customer, tiers);

  // Track order event
  await trackOrderPlaced(shop, customer, order, tiers);

  // Track cashback earned if applicable
  if (order.cashbackEarned > 0) {
    await trackCashbackEarned(
      shop,
      customer,
      order.cashbackEarned,
      order.id,
      order.orderNumber
    );
  }

  return true;
}

// ============================================
// SETTINGS HELPERS
// ============================================

/**
 * Get email settings for a shop with provider info
 */
export async function getEmailSettingsWithProvider(shop: string) {
  return prisma.emailSettings.findUnique({
    where: { shop },
    select: {
      shop: true,
      senderName: true,
      senderEmail: true,
      replyToEmail: true,
      emailProvider: true,
      klaviyoEnabled: true,
      klaviyoApiKey: true,
      klaviyoPublicKey: true,
      klaviyoDefaultListId: true,
      klaviyoSyncProfiles: true,
      klaviyoSyncEvents: true,
      klaviyoLastSyncAt: true,
      klaviyoSyncStatus: true,
    },
  });
}

/**
 * Update email provider settings
 */
export async function updateEmailProviderSettings(
  shop: string,
  settings: {
    emailProvider?: EmailProviderEnum;
    klaviyoEnabled?: boolean;
    klaviyoApiKey?: string;
    klaviyoPublicKey?: string;
    klaviyoDefaultListId?: string;
    klaviyoSyncProfiles?: boolean;
    klaviyoSyncEvents?: boolean;
  }
) {
  return prisma.emailSettings.update({
    where: { shop },
    data: settings,
  });
}
