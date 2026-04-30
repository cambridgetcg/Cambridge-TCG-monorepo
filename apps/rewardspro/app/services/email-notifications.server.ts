/**
 * Email Notifications Service
 *
 * Handles sending automated email notifications for:
 * - Welcome emails → routed through email-provider.server (SendGrid/Klaviyo)
 * - Tier upgrade emails → routed through email-provider.server
 * - Campaign emails → routed through email-provider.server
 * - Points/streak/tier-expiration emails → direct SendGrid (TODO: route through email-provider)
 *
 * ENTITLEMENTS: Email sending is limited by plan (rate-based gating):
 * - Free: 50/month, Pro: 500/month, Max: 2000/month, Ultra: unlimited
 */

import prisma from "~/db.server";
import * as sendgrid from "./sendgrid.server";
import {
  sendWelcomeEmailUnified,
  sendTierUpgradeEmailUnified,
  sendBatchMarketingEmails,
} from "./email-provider.server";
import { checkEmailLimit, recordEmailSent } from "./email-usage-control.server";
import { sanitizeEmailHtml } from "~/utils/html-sanitizer";
import {
  buildPointsEarnedEmail,
  buildPointsExpiringEmail,
  buildPointsRedeemedEmail,
  buildStreakMilestoneEmail,
  buildTierExpirationWarningEmail,
  buildTierExpiredEmail,
} from "./email-templates.server";

// ============================================
// TYPES
// ============================================

interface CustomerInfo {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  shop: string;
}

interface TierInfo {
  id: string;
  name: string;
  cashbackPercent: number;
  benefits?: string[];
}

interface EmailNotificationResult {
  success: boolean;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

// ============================================
// HELPERS
// ============================================

/**
 * Check if email notifications are enabled for a shop
 */
async function isEmailEnabled(_shop: string): Promise<boolean> {
  // Check if SendGrid API key is configured
  if (!process.env.SENDGRID_API_KEY) {
    console.log(`[EmailNotifications] SendGrid not configured, skipping email`);
    return false;
  }

  // Check if shop has email settings (optional - can be enhanced later)
  // For now, if SendGrid is configured, emails are enabled
  return true;
}

/**
 * Get shop display name
 */
async function getShopName(shop: string): Promise<string> {
  try {
    const shopSettings = await prisma.shopSettings.findUnique({
      where: { shop },
    });
    return shopSettings?.storeName || shop.replace(".myshopify.com", "");
  } catch (e) {
    return shop.replace(".myshopify.com", "");
  }
}

// ============================================
// WELCOME EMAIL
// ============================================

/**
 * Send welcome email to a new customer
 * Called from customers/create webhook
 *
 * @param shop - Shop domain
 * @param customer - Customer info
 * @param tier - Initial tier (if assigned)
 */
export async function sendWelcomeEmailNotification(
  shop: string,
  customer: CustomerInfo,
  tier?: TierInfo | null
): Promise<EmailNotificationResult> {
  console.log(`[EmailNotifications] Attempting to send welcome email to customer ${customer.id}`);

  // Skip if no email address
  if (!customer.email) {
    console.log(`[EmailNotifications] No email address for customer ${customer.id}, skipping`);
    return { success: true, skipped: true, reason: "No email address" };
  }

  // Check if email is enabled
  if (!(await isEmailEnabled(shop))) {
    return { success: true, skipped: true, reason: "Email not enabled" };
  }

  // Check email usage limit (rate-based gating)
  const usageCheck = await checkEmailLimit(shop, 1);
  if (!usageCheck.allowed) {
    console.log(`[EmailNotifications] Email limit reached for shop ${shop}: ${usageCheck.message}`);
    return { success: true, skipped: true, reason: usageCheck.message };
  }

  try {
    // Route through unified email provider (handles SendGrid vs Klaviyo routing + usage tracking)
    const success = await sendWelcomeEmailUnified(shop, {
      customer: customer as any,
      storeName: await getShopName(shop),
      tierName: tier?.name || "Member",
      cashbackPercent: tier?.cashbackPercent || 0,
    });

    if (success) {
      console.log(`[EmailNotifications] ✅ Welcome email sent to customer ${customer.id}`);

      // Log email event (optional - for analytics)
      try {
        await prisma.emailEvent.create({
          data: {
            id: crypto.randomUUID(),
            shop,
            eventType: "WELCOME",
            customerEmail: customer.email,
            metadata: { customerId: customer.id, tierName: tier?.name, status: "SENT" },
            createdAt: new Date(),
          },
        });
      } catch (e) {
        // Event logging is optional, don't fail on error
        console.log(`[EmailNotifications] Could not log email event (table may not exist)`);
      }

      return { success: true };
    } else {
      console.error(`[EmailNotifications] ❌ Failed to send welcome email`);
      return { success: false, error: "Email provider returned failure" };
    }
  } catch (error: any) {
    console.error(`[EmailNotifications] ❌ Error sending welcome email:`, error);
    return { success: false, error: error.message };
  }
}

// ============================================
// TIER UPGRADE EMAIL
// ============================================

/**
 * Send tier upgrade notification email
 * Called from orders/paid webhook when tier changes
 *
 * @param shop - Shop domain
 * @param customer - Customer info
 * @param previousTier - Previous tier (or null if first tier)
 * @param newTier - New tier
 */
export async function sendTierUpgradeEmailNotification(
  shop: string,
  customer: CustomerInfo,
  previousTier: TierInfo | null,
  newTier: TierInfo
): Promise<EmailNotificationResult> {
  console.log(`[EmailNotifications] Attempting to send tier upgrade email to customer ${customer.id}`);

  // Skip if no email address
  if (!customer.email) {
    console.log(`[EmailNotifications] No email address for customer ${customer.id}, skipping`);
    return { success: true, skipped: true, reason: "No email address" };
  }

  // Check if email is enabled
  if (!(await isEmailEnabled(shop))) {
    return { success: true, skipped: true, reason: "Email not enabled" };
  }

  // Skip if it's not actually an upgrade (same tier or downgrade)
  if (previousTier && previousTier.id === newTier.id) {
    console.log(`[EmailNotifications] Same tier, skipping upgrade email`);
    return { success: true, skipped: true, reason: "No tier change" };
  }

  // Check email usage limit (rate-based gating)
  const usageCheck = await checkEmailLimit(shop, 1);
  if (!usageCheck.allowed) {
    console.log(`[EmailNotifications] Email limit reached for shop ${shop}: ${usageCheck.message}`);
    return { success: true, skipped: true, reason: usageCheck.message };
  }

  try {
    // Route through unified email provider (handles SendGrid vs Klaviyo routing + usage tracking)
    const success = await sendTierUpgradeEmailUnified(shop, {
      customer: customer as any,
      previousTier: previousTier ? ({ name: previousTier.name } as any) : null,
      newTier: { name: newTier.name, cashbackPercent: newTier.cashbackPercent } as any,
    });

    if (success) {
      console.log(`[EmailNotifications] ✅ Tier upgrade email sent to customer ${customer.id}`);

      // Log email event
      try {
        await prisma.emailEvent.create({
          data: {
            id: crypto.randomUUID(),
            shop,
            eventType: "TIER_UPGRADE",
            customerEmail: customer.email,
            metadata: {
              customerId: customer.id,
              previousTierName: previousTier?.name,
              newTierName: newTier.name,
              status: "SENT",
            },
            createdAt: new Date(),
          },
        });
      } catch (e) {
        // Event logging is optional
        console.log(`[EmailNotifications] Could not log email event`);
      }

      return { success: true };
    } else {
      console.error(`[EmailNotifications] ❌ Failed to send tier upgrade email`);
      return { success: false, error: "Email provider returned failure" };
    }
  } catch (error: any) {
    console.error(`[EmailNotifications] ❌ Error sending tier upgrade email:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a tier downgrade email notification.
 *
 * Triggered when a customer drops to a lower tier — refund causing spending to
 * fall below threshold, subscription cancellation/expiry, manual override end.
 * Uses the existing buildTierExpiredEmail template (closest fit) and sends
 * directly via SendGrid.
 *
 * @param shop - Shop domain
 * @param customer - Customer info
 * @param previousTier - Tier they were on
 * @param newTier - Tier they were demoted to (null if dropped to no tier)
 */
export async function sendTierDowngradeEmailNotification(
  shop: string,
  customer: CustomerInfo,
  previousTier: TierInfo,
  newTier: TierInfo | null
): Promise<EmailNotificationResult> {
  if (!customer.email) {
    return { success: true, skipped: true, reason: "No email address" };
  }

  if (!(await isEmailEnabled(shop))) {
    return { success: true, skipped: true, reason: "Email not enabled" };
  }

  // Skip if it's not actually a downgrade (no change or upgrade)
  if (newTier && previousTier.id === newTier.id) {
    return { success: true, skipped: true, reason: "No tier change" };
  }

  const usageCheck = await checkEmailLimit(shop, 1);
  if (!usageCheck.allowed) {
    return { success: true, skipped: true, reason: usageCheck.message };
  }

  try {
    // Get shop name for the template
    const settings = await prisma.shopSettings.findUnique({
      where: { shop },
      select: { storeName: true },
    });
    const storeName = settings?.storeName || shop.replace(/\.myshopify\.com$/, "");

    const customerName =
      [customer.firstName, customer.lastName].filter(Boolean).join(" ") || "there";

    const newTierText = newTier
      ? `You've been moved to the ${newTier.name} tier (${newTier.cashbackPercent}% cashback).`
      : `You no longer have an active membership tier.`;

    const { subject, html } = buildTierExpiredEmail({
      customerName,
      storeName,
      expiredTierName: previousTier.name,
      newTierText,
    });

    const result = await sendgrid.sendEmail(shop, {
      to: { email: customer.email },
      subject,
      html: sanitizeEmailHtml(html),
    });

    if (result.success) {
      await recordEmailSent(shop, 1, "transactional");

      try {
        await prisma.emailEvent.create({
          data: {
            id: crypto.randomUUID(),
            shop,
            eventType: "TIER_DOWNGRADE",
            customerEmail: customer.email,
            metadata: {
              customerId: customer.id,
              previousTierName: previousTier.name,
              newTierName: newTier?.name ?? null,
              status: "SENT",
            },
            createdAt: new Date(),
          },
        });
      } catch {
        // Event logging is optional
      }

      return { success: true };
    }

    return { success: false, error: result.error || "SendGrid returned failure" };
  } catch (error: any) {
    console.error(`[EmailNotifications] ❌ Error sending tier downgrade email:`, error);
    return { success: false, error: error.message };
  }
}

// ============================================
// CAMPAIGN EMAILS
// ============================================

/**
 * Send campaign emails to recipients
 * Called from campaign send action
 *
 * @param shop - Shop domain
 * @param campaignId - Campaign ID
 * @param recipients - List of recipients
 */
export async function sendCampaignEmails(
  shop: string,
  campaignId: string,
  recipients: Array<{ email: string; name?: string; customerId?: string }>
): Promise<{ sent: number; failed: number; errors: string[] }> {
  console.log(`[EmailNotifications] Sending campaign ${campaignId} to ${recipients.length} recipients`);

  // Check if email is enabled
  if (!(await isEmailEnabled(shop))) {
    console.log(`[EmailNotifications] Email not enabled, skipping campaign send`);
    return { sent: 0, failed: 0, errors: ["Email not enabled"] };
  }

  // Get campaign details
  const campaign = await prisma.emailCampaign.findFirst({
    where: { id: campaignId, shop },
  });

  if (!campaign) {
    return { sent: 0, failed: recipients.length, errors: ["Campaign not found"] };
  }

  // Get email content from template
  const template = await prisma.emailTemplate.findFirst({
    where: { id: campaign.templateId, shop },
  });

  const rawHtmlContent = template?.htmlContent || "";

  if (!rawHtmlContent) {
    return { sent: 0, failed: recipients.length, errors: ["No email content - template not found or has no content"] };
  }

  // Sanitize HTML to strip dangerous tags/attributes (XSS prevention)
  const htmlContent = sanitizeEmailHtml(rawHtmlContent);

  // Filter recipients with valid emails
  const validRecipients = recipients.filter((r) => r.email && r.email.includes("@"));

  if (validRecipients.length === 0) {
    return { sent: 0, failed: 0, errors: ["No valid recipients"] };
  }

  // Route through unified email provider (handles SendGrid vs Klaviyo routing)
  const batchResult = await sendBatchMarketingEmails(shop, {
    recipients: validRecipients.map((r) => ({ email: r.email, name: r.name })),
    subject: campaign.subject || "Update from us",
    html: htmlContent,
    categories: ["campaign", campaignId],
  });

  const result = {
    sent: batchResult.success ? validRecipients.length : 0,
    failed: batchResult.success ? 0 : validRecipients.length,
    errors: batchResult.error ? [batchResult.error] : [] as string[],
  };

  // Log campaign send event
  try {
    await prisma.emailEvent.create({
      data: {
        id: crypto.randomUUID(),
        shop,
        eventType: "CAMPAIGN",
        campaignId,
        customerEmail: recipients[0]?.email || "campaign@batch",
        metadata: {
          sent: result.sent,
          failed: result.failed,
          totalRecipients: validRecipients.length,
          status: result.sent > 0 ? "SENT" : "FAILED",
        },
        createdAt: new Date(),
      },
    });
  } catch (e) {
    console.log(`[EmailNotifications] Could not log campaign event`);
  }

  return {
    sent: result.sent,
    failed: result.failed,
    errors: result.errors,
  };
}

// ============================================
// POINTS ENGAGEMENT EMAILS
// ============================================

/**
 * Points earned notification
 */
interface PointsEarnedEmailData {
  customerId: string;
  email: string;
  firstName: string | null;
  pointsEarned: number;
  totalBalance: number;
  orderNumber?: string;
  tierMultiplier?: number;
  bonusEvents?: string[];
  currencyName: string;
  currencyIcon: string;
}

/**
 * Send email when customer earns points
 */
export async function sendPointsEarnedEmail(
  shop: string,
  data: PointsEarnedEmailData
): Promise<EmailNotificationResult> {
  if (!(await isEmailEnabled(shop))) {
    return { success: true, skipped: true, reason: "Email not enabled" };
  }

  if (!data.email) {
    return { success: true, skipped: true, reason: "No email address" };
  }

  try {
    const storeName = await getShopName(shop);

    let bonusInfo = "";
    if (data.tierMultiplier && data.tierMultiplier > 1) {
      bonusInfo += `\n${data.currencyIcon} ${Math.round((data.tierMultiplier - 1) * 100)}% tier bonus applied!`;
    }
    if (data.bonusEvents && data.bonusEvents.length > 0) {
      bonusInfo += `\n${data.currencyIcon} Active promotions: ${data.bonusEvents.join(", ")}`;
    }

    const { subject, html } = buildPointsEarnedEmail({
      customerName: data.firstName || "Valued Customer",
      storeName,
      pointsEarned: data.pointsEarned,
      totalBalance: data.totalBalance,
      orderNumber: data.orderNumber,
      bonusInfo,
      currencyName: data.currencyName,
      currencyIcon: data.currencyIcon,
    });

    const result = await sendgrid.sendEmail(shop, {
      to: { email: data.email } as any,
      subject,
      html,
    });

    if (result.success) {
      console.log(`[EmailNotifications] ✅ Points earned email sent to ${data.email}`);
      return { success: true };
    } else {
      return { success: false, error: result.error };
    }
  } catch (error: any) {
    console.error(`[EmailNotifications] ❌ Error sending points earned email:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Points expiration warning notification
 */
interface PointsExpiringEmailData {
  customerId: string;
  email: string;
  firstName: string | null;
  pointsExpiring: number;
  daysUntilExpiry: number;
  currencyName: string;
  currencyIcon: string;
}

/**
 * Send email warning about points expiring soon
 */
export async function sendPointsExpiringEmail(
  shop: string,
  data: PointsExpiringEmailData
): Promise<EmailNotificationResult> {
  if (!(await isEmailEnabled(shop))) {
    return { success: true, skipped: true, reason: "Email not enabled" };
  }

  if (!data.email) {
    return { success: true, skipped: true, reason: "No email address" };
  }

  try {
    const storeName = await getShopName(shop);

    const { subject, html } = buildPointsExpiringEmail({
      customerName: data.firstName || "Valued Customer",
      storeName,
      pointsExpiring: data.pointsExpiring,
      daysUntilExpiry: data.daysUntilExpiry,
      currencyName: data.currencyName,
      currencyIcon: data.currencyIcon,
    });

    const result = await sendgrid.sendEmail(shop, {
      to: { email: data.email } as any,
      subject,
      html,
    });

    if (result.success) {
      console.log(`[EmailNotifications] ✅ Points expiring email sent to ${data.email}`);
      return { success: true };
    } else {
      return { success: false, error: result.error };
    }
  } catch (error: any) {
    console.error(`[EmailNotifications] ❌ Error sending points expiring email:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Points redemption confirmation
 */
interface PointsRedeemedEmailData {
  customerId: string;
  email: string;
  firstName: string | null;
  pointsSpent: number;
  remainingBalance: number;
  discountCode: string;
  discountValue: number;
  discountType: "fixed" | "percentage" | "shipping";
  expiresAt: Date;
  currencyName: string;
  currencyIcon: string;
}

/**
 * Send email confirming points redemption with discount code
 */
export async function sendPointsRedeemedEmail(
  shop: string,
  data: PointsRedeemedEmailData
): Promise<EmailNotificationResult> {
  if (!(await isEmailEnabled(shop))) {
    return { success: true, skipped: true, reason: "Email not enabled" };
  }

  if (!data.email) {
    return { success: true, skipped: true, reason: "No email address" };
  }

  try {
    const storeName = await getShopName(shop);

    let discountText = "";
    if (data.discountType === "fixed") {
      discountText = `$${data.discountValue} OFF`;
    } else if (data.discountType === "percentage") {
      discountText = `${data.discountValue}% OFF`;
    } else {
      discountText = "FREE SHIPPING";
    }

    const expiryDate = data.expiresAt.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const { subject, html } = buildPointsRedeemedEmail({
      customerName: data.firstName || "Valued Customer",
      storeName,
      pointsSpent: data.pointsSpent,
      remainingBalance: data.remainingBalance,
      discountCode: data.discountCode,
      discountText,
      expiryDate,
      currencyName: data.currencyName,
      currencyIcon: data.currencyIcon,
    });

    const result = await sendgrid.sendEmail(shop, {
      to: { email: data.email } as any,
      subject,
      html,
    });

    if (result.success) {
      console.log(`[EmailNotifications] ✅ Points redeemed email sent to ${data.email}`);
      return { success: true };
    } else {
      return { success: false, error: result.error };
    }
  } catch (error: any) {
    console.error(`[EmailNotifications] ❌ Error sending points redeemed email:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Streak milestone celebration
 */
interface StreakMilestoneEmailData {
  customerId: string;
  email: string;
  firstName: string | null;
  streakDays: number;
  bonusMultiplier: number;
  currencyName: string;
  currencyIcon: string;
}

/**
 * Send email celebrating streak milestone
 */
export async function sendStreakMilestoneEmail(
  shop: string,
  data: StreakMilestoneEmailData
): Promise<EmailNotificationResult> {
  if (!(await isEmailEnabled(shop))) {
    return { success: true, skipped: true, reason: "Email not enabled" };
  }

  if (!data.email) {
    return { success: true, skipped: true, reason: "No email address" };
  }

  try {
    const storeName = await getShopName(shop);

    const { subject, html } = buildStreakMilestoneEmail({
      customerName: data.firstName || "Valued Customer",
      storeName,
      streakDays: data.streakDays,
      bonusPercent: Math.round((data.bonusMultiplier - 1) * 100),
      currencyName: data.currencyName,
      currencyIcon: data.currencyIcon,
    });

    const result = await sendgrid.sendEmail(shop, {
      to: { email: data.email } as any,
      subject,
      html,
    });

    if (result.success) {
      console.log(`[EmailNotifications] ✅ Streak milestone email sent to ${data.email}`);
      return { success: true };
    } else {
      return { success: false, error: result.error };
    }
  } catch (error: any) {
    console.error(`[EmailNotifications] ❌ Error sending streak milestone email:`, error);
    return { success: false, error: error.message };
  }
}

// ============================================
// TIER PURCHASE EXPIRATION EMAILS
// ============================================

/**
 * Tier purchase expiration warning data
 */
interface TierExpirationWarningEmailData {
  customerId: string;
  email: string;
  firstName: string | null;
  tierName: string;
  tierBenefits: string[];
  daysUntilExpiry: number;
  expirationDate: Date;
  renewalUrl?: string;
}

/**
 * Send email warning about tier purchase expiring soon
 * Called from tier-maintenance cron job
 *
 * @param shop - Shop domain
 * @param data - Expiration warning data
 */
export async function sendTierExpirationWarningEmail(
  shop: string,
  data: TierExpirationWarningEmailData
): Promise<EmailNotificationResult> {
  console.log(`[EmailNotifications] Attempting to send tier expiration warning to customer ${data.customerId}`);

  if (!(await isEmailEnabled(shop))) {
    return { success: true, skipped: true, reason: "Email not enabled" };
  }

  if (!data.email) {
    return { success: true, skipped: true, reason: "No email address" };
  }

  // Check email usage limit (rate-based gating)
  const usageCheck = await checkEmailLimit(shop, 1);
  if (!usageCheck.allowed) {
    console.log(`[EmailNotifications] Email limit reached for shop ${shop}: ${usageCheck.message}`);
    return { success: true, skipped: true, reason: usageCheck.message };
  }

  try {
    const storeName = await getShopName(shop);

    const { subject, html } = buildTierExpirationWarningEmail({
      customerName: data.firstName || "Valued Customer",
      storeName,
      tierName: data.tierName,
      tierBenefits: data.tierBenefits,
      daysUntilExpiry: data.daysUntilExpiry,
      expiryDate: data.expirationDate.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
      renewalUrl: data.renewalUrl,
    });

    const result = await sendgrid.sendEmail(shop, {
      to: { email: data.email } as any,
      subject,
      html,
    });

    if (result.success) {
      console.log(`[EmailNotifications] ✅ Tier expiration warning email sent to ${data.email}`);

      // Record email sent for usage tracking
      await recordEmailSent(shop, 1, "transactional");

      // Log email event
      try {
        await prisma.emailEvent.create({
          data: {
            id: crypto.randomUUID(),
            shop,
            eventType: "TIER_EXPIRATION_WARNING",
            customerEmail: data.email,
            metadata: {
              customerId: data.customerId,
              tierName: data.tierName,
              daysUntilExpiry: data.daysUntilExpiry,
              expirationDate: data.expirationDate.toISOString(),
              status: "SENT",
            },
            createdAt: new Date(),
          },
        });
      } catch (e) {
        console.log(`[EmailNotifications] Could not log email event`);
      }

      return { success: true };
    } else {
      if (result.error?.includes("Maximum credits exceeded")) {
        console.error(`[EmailNotifications] ⚠️ ALERT: SendGrid credits exhausted!`);
      }
      console.error(`[EmailNotifications] ❌ Failed to send tier expiration warning: ${result.error}`);
      return { success: false, error: result.error };
    }
  } catch (error: any) {
    console.error(`[EmailNotifications] ❌ Error sending tier expiration warning email:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Tier expired notification data
 */
interface TierExpiredEmailData {
  customerId: string;
  email: string;
  firstName: string | null;
  expiredTierName: string;
  newTierName: string | null;
  renewalUrl?: string;
}

/**
 * Send email notifying customer their tier has expired
 * Called from tier-maintenance cron job after expiration
 *
 * @param shop - Shop domain
 * @param data - Expiration notification data
 */
export async function sendTierExpiredEmail(
  shop: string,
  data: TierExpiredEmailData
): Promise<EmailNotificationResult> {
  console.log(`[EmailNotifications] Attempting to send tier expired notification to customer ${data.customerId}`);

  if (!(await isEmailEnabled(shop))) {
    return { success: true, skipped: true, reason: "Email not enabled" };
  }

  if (!data.email) {
    return { success: true, skipped: true, reason: "No email address" };
  }

  // Check email usage limit (rate-based gating)
  const usageCheck = await checkEmailLimit(shop, 1);
  if (!usageCheck.allowed) {
    console.log(`[EmailNotifications] Email limit reached for shop ${shop}: ${usageCheck.message}`);
    return { success: true, skipped: true, reason: usageCheck.message };
  }

  try {
    const storeName = await getShopName(shop);

    const { subject, html } = buildTierExpiredEmail({
      customerName: data.firstName || "Valued Customer",
      storeName,
      expiredTierName: data.expiredTierName,
      newTierText: data.newTierName
        ? `You've been moved to <strong>${data.newTierName}</strong> tier.`
        : `Your tier membership has been removed.`,
      renewalUrl: data.renewalUrl,
    });

    const result = await sendgrid.sendEmail(shop, {
      to: { email: data.email } as any,
      subject,
      html,
    });

    if (result.success) {
      console.log(`[EmailNotifications] ✅ Tier expired email sent to ${data.email}`);

      // Record email sent for usage tracking
      await recordEmailSent(shop, 1, "transactional");

      // Log email event
      try {
        await prisma.emailEvent.create({
          data: {
            id: crypto.randomUUID(),
            shop,
            eventType: "TIER_EXPIRED",
            customerEmail: data.email,
            metadata: {
              customerId: data.customerId,
              expiredTierName: data.expiredTierName,
              newTierName: data.newTierName,
              status: "SENT",
            },
            createdAt: new Date(),
          },
        });
      } catch (e) {
        console.log(`[EmailNotifications] Could not log email event`);
      }

      return { success: true };
    } else {
      console.error(`[EmailNotifications] ❌ Failed to send tier expired email: ${result.error}`);
      return { success: false, error: result.error };
    }
  } catch (error: any) {
    console.error(`[EmailNotifications] ❌ Error sending tier expired email:`, error);
    return { success: false, error: error.message };
  }
}
