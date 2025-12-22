/**
 * Email Provider Abstraction
 *
 * Unified interface for email providers (SendGrid, Klaviyo).
 * Allows seamless switching between providers based on shop settings.
 */

import db from "~/db.server";
import type { EmailProvider as EmailProviderEnum, Tier, Customer } from "@prisma/client";
import {
  sendEmail as sendGridSendEmail,
  sendBatchEmails as sendGridBatchEmails,
  sendWelcomeEmail as sendGridWelcomeEmail,
  sendTierUpgradeEmail as sendGridTierUpgradeEmail,
} from "./sendgrid.server";
import {
  getKlaviyoService,
  isKlaviyoEnabled,
} from "./klaviyo.server";
import {
  trackCustomerEnrolled,
  trackTierUpgraded,
  trackOrderPlaced,
  trackCashbackEarned,
  syncCustomerToKlaviyo,
} from "./klaviyo-events.server";

// ============================================
// TYPES
// ============================================

export interface EmailRecipient {
  email: string;
  name?: string;
  customerId?: string;
}

export interface SendEmailParams {
  to: EmailRecipient;
  subject: string;
  html: string;
  text?: string;
  from?: { email: string; name: string };
  replyTo?: string;
  categories?: string[];
  customArgs?: Record<string, string>;
}

export interface BatchEmailParams {
  recipients: EmailRecipient[];
  subject: string;
  html: string;
  text?: string;
  categories?: string[];
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

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
  const settings = await db.emailSettings.findUnique({
    where: { shop },
    select: { emailProvider: true },
  });

  return settings?.emailProvider || "SENDGRID";
}

/**
 * Check if Klaviyo should handle marketing emails for this shop
 */
export async function shouldUseKlaviyoForMarketing(shop: string): Promise<boolean> {
  const settings = await db.emailSettings.findUnique({
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
  const settings = await db.emailSettings.findUnique({
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

/**
 * Send a transactional email
 * Uses SendGrid for SENDGRID and HYBRID modes
 * Uses Klaviyo flows for KLAVIYO mode
 */
export async function sendTransactionalEmail(
  shop: string,
  params: SendEmailParams
): Promise<EmailResult> {
  const providerType = await getEmailProviderType(shop);

  switch (providerType) {
    case "KLAVIYO":
      // For pure Klaviyo mode, transactional emails should be handled by Klaviyo flows
      // triggered by events. Return success and let the flow handle it.
      console.log(
        "[EmailProvider] Transactional emails in KLAVIYO mode handled by flows"
      );
      return { success: true };

    case "HYBRID":
    case "SENDGRID":
    default:
      // Use SendGrid for transactional emails
      try {
        const result = await sendGridSendEmail({
          to: params.to.email,
          toName: params.to.name,
          subject: params.subject,
          html: params.html,
          text: params.text,
          from: params.from?.email,
          fromName: params.from?.name,
          replyTo: params.replyTo,
          categories: params.categories,
          customArgs: params.customArgs,
        });
        return { success: result, messageId: result ? "sent" : undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
  }
}

/**
 * Send welcome email based on provider settings
 */
export async function sendWelcomeEmailUnified(
  shop: string,
  params: WelcomeEmailParams
): Promise<boolean> {
  const { customer, storeName, tierName, cashbackPercent } = params;
  const providerType = await getEmailProviderType(shop);

  // Always sync to Klaviyo if enabled (for both KLAVIYO and HYBRID modes)
  if (await isKlaviyoEnabled(shop)) {
    // Get tiers for profile properties
    const tiers = await db.tier.findMany({
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
    return true;
  }

  // For SENDGRID and HYBRID modes, also send via SendGrid
  try {
    const settings = await db.emailSettings.findUnique({
      where: { shop },
    });

    if (!settings) {
      console.error("[EmailProvider] No email settings found for shop:", shop);
      return false;
    }

    await sendGridWelcomeEmail({
      to: customer.email,
      storeName,
      customerName: customer.firstName || undefined,
      tierName: tierName || customer.currentTier?.name,
      cashbackPercent: cashbackPercent || customer.currentTier?.cashbackPercent,
    });

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
  const { customer, previousTier, newTier, qualifyingOrderId } = params;
  const providerType = await getEmailProviderType(shop);

  // Always sync to Klaviyo if enabled
  if (await isKlaviyoEnabled(shop)) {
    const tiers = await db.tier.findMany({
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
    return true;
  }

  // For SENDGRID and HYBRID modes, also send via SendGrid
  try {
    const settings = await db.emailSettings.findUnique({
      where: { shop },
    });

    if (!settings) {
      return false;
    }

    const store = await db.store.findUnique({
      where: { shop },
      select: { name: true },
    });

    await sendGridTierUpgradeEmail({
      to: customer.email,
      storeName: store?.name || shop,
      customerName: customer.firstName || undefined,
      previousTierName: previousTier?.name,
      newTierName: newTier.name,
      newCashbackPercent: newTier.cashbackPercent,
    });

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

  const tiers = await db.tier.findMany({
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
// BATCH OPERATIONS
// ============================================

/**
 * Send batch marketing emails
 * Uses Klaviyo for KLAVIYO and HYBRID modes
 * Uses SendGrid for SENDGRID mode
 */
export async function sendBatchMarketingEmails(
  shop: string,
  params: BatchEmailParams
): Promise<EmailResult> {
  const useKlaviyo = await shouldUseKlaviyoForMarketing(shop);

  if (useKlaviyo) {
    // For Klaviyo, marketing should be done through campaigns or flows
    // This is just a placeholder - actual implementation would use Klaviyo campaigns API
    console.log(
      "[EmailProvider] Batch marketing emails should use Klaviyo campaigns"
    );
    return { success: true };
  }

  // Use SendGrid for batch emails
  try {
    const result = await sendGridBatchEmails(
      params.recipients.map((r) => ({
        email: r.email,
        name: r.name,
        customerId: r.customerId,
      })),
      params.subject,
      params.html,
      params.text,
      params.categories
    );

    return { success: result > 0 };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================
// SETTINGS HELPERS
// ============================================

/**
 * Get email settings for a shop with provider info
 */
export async function getEmailSettingsWithProvider(shop: string) {
  return db.emailSettings.findUnique({
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
  return db.emailSettings.update({
    where: { shop },
    data: settings,
  });
}
