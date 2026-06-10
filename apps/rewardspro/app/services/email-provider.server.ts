/**
 * Email Provider Abstraction
 *
 * Unified interface for email providers (SendGrid, Klaviyo).
 * Allows seamless switching between providers based on shop settings.
 */

import prisma from "~/db.server";
import type { EmailProvider as EmailProviderEnum, Tier, Customer } from "@prisma/client";
import {
  sendEmail as sendGridSendEmail,
  sendBatchEmails as sendGridBatchEmails,
  sendWelcomeEmail as sendGridWelcomeEmail,
  sendTierUpgradeEmail as sendGridTierUpgradeEmail,
} from "./sendgrid.server";
import { sendEmail as sesSendEmail } from "./ses.server";
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

/**
 * Send a transactional email
 * Uses SendGrid for SENDGRID and HYBRID modes
 * Uses Klaviyo flows for KLAVIYO mode
 */
export async function sendTransactionalEmail(
  shop: string,
  params: SendEmailParams
): Promise<EmailResult> {
  // Check email limit before sending
  const usageCheck = await checkEmailLimit(shop, 1);
  if (!usageCheck.allowed) {
    console.log(`[EmailProvider] Email limit reached for ${shop}: ${usageCheck.message}`);
    return {
      success: false,
      error: usageCheck.message,
    };
  }

  const providerType = await getEmailProviderType(shop);

  switch (providerType) {
    case "KLAVIYO":
      // For pure Klaviyo mode, transactional emails should be handled by Klaviyo flows
      // triggered by events. Return success and let the flow handle it.
      console.log(
        "[EmailProvider] Transactional emails in KLAVIYO mode handled by flows"
      );
      // Record the email even for Klaviyo (flow will send it)
      await recordEmailSent(shop, 1, "transactional");
      return { success: true };

    case "HYBRID":
    case "SENDGRID":
    default:
      // Default backend is SendGrid; opt-in to SES with EMAIL_PROVIDER=ses
      // (SES needs prod access first — see app/services/ses.server.ts header).
      const useSES = (process.env.EMAIL_PROVIDER || "").toLowerCase() === "ses";
      try {
        const result = useSES
          ? await sesSendEmail(shop, {
              to: { email: params.to.email, name: params.to.name },
              subject: params.subject,
              html: params.html,
              text: params.text,
              from: params.from ? { email: params.from.email, name: params.from.name } : undefined,
              replyTo: params.replyTo ? { email: params.replyTo } : undefined,
            })
          : await sendGridSendEmail(shop, {
              to: { email: params.to.email, name: params.to.name },
              subject: params.subject,
              html: params.html,
              text: params.text,
              from: params.from ? { email: params.from.email, name: params.from.name } : undefined,
              replyTo: params.replyTo ? { email: params.replyTo } : undefined,
              categories: params.categories,
              customArgs: params.customArgs,
            });
        if (result.success) {
          // Record successful email send
          await recordEmailSent(shop, 1, "transactional");
        }
        return {
          success: result.success,
          messageId: result.success ? (useSES ? (result as any).messageId : "sent") : undefined,
          error: result.success ? undefined : (result as any).error,
        };
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
  // Check email limit before sending
  const usageCheck = await checkEmailLimit(shop, 1);
  if (!usageCheck.allowed) {
    console.log(`[EmailProvider] Email limit reached for ${shop}: ${usageCheck.message}`);
    return false;
  }

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
  // Check email limit before sending
  const usageCheck = await checkEmailLimit(shop, 1);
  if (!usageCheck.allowed) {
    console.log(`[EmailProvider] Email limit reached for ${shop}: ${usageCheck.message}`);
    return false;
  }

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
  const recipientCount = params.recipients.length;

  // Check email limit before sending batch
  const usageCheck = await checkEmailLimit(shop, recipientCount);
  if (!usageCheck.allowed) {
    console.log(`[EmailProvider] Email limit reached for ${shop}: ${usageCheck.message}`);
    return {
      success: false,
      error: usageCheck.message,
    };
  }

  const useKlaviyo = await shouldUseKlaviyoForMarketing(shop);

  if (useKlaviyo) {
    // For Klaviyo, marketing should be done through campaigns or flows
    // This is just a placeholder - actual implementation would use Klaviyo campaigns API
    console.log(
      "[EmailProvider] Batch marketing emails should use Klaviyo campaigns"
    );
    // Record the emails (Klaviyo will handle sending)
    await recordEmailSent(shop, recipientCount, "campaign");
    return { success: true };
  }

  // Use SendGrid for batch emails
  try {
    const result = await sendGridBatchEmails(
      shop,
      params.recipients.map((r) => ({
        email: r.email,
        name: r.name,
        customerId: r.customerId,
      })),
      {
        subject: params.subject,
        html: params.html,
        text: params.text,
        categories: params.categories,
      }
    );

    if (result.sent > 0) {
      // Record successful email sends
      await recordEmailSent(shop, result.sent, "campaign");
    }

    return { success: result.sent > 0 };
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
