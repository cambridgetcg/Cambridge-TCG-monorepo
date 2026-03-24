/**
 * Email Notifications Service
 *
 * Handles sending automated email notifications for:
 * - Welcome emails (new customers)
 * - Tier upgrade emails
 * - Campaign emails
 *
 * This service wraps the SendGrid service with proper error handling
 * to ensure email failures don't break webhook processing.
 *
 * ENTITLEMENTS: Email sending is limited by plan (rate-based gating):
 * - Free: 50/month, Pro: 500/month, Max: 2000/month, Ultra: unlimited
 */

import prisma from "~/db.server";
import * as sendgrid from "./sendgrid.server";
import { checkEmailLimit, recordEmailSent } from "./email-usage-control.server";

// ============================================
// HTML SANITIZATION
// ============================================

/**
 * Sanitize HTML content for email sending.
 * Strips dangerous tags (script, iframe, object, embed, form, etc.) and
 * event handler attributes (onclick, onerror, onload, etc.) to prevent
 * XSS if an admin account is compromised.
 */
function sanitizeEmailHtml(html: string): string {
  // Remove dangerous tags and their contents
  let sanitized = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, "")
    .replace(/<embed\b[^>]*>[\s\S]*?<\/embed>/gi, "")
    .replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, "")
    .replace(/<input\b[^>]*\/?>/gi, "")
    .replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/gi, "")
    .replace(/<select\b[^>]*>[\s\S]*?<\/select>/gi, "")
    .replace(/<button\b[^>]*>[\s\S]*?<\/button>/gi, "")
    .replace(/<applet\b[^>]*>[\s\S]*?<\/applet>/gi, "")
    .replace(/<base\b[^>]*\/?>/gi, "")
    .replace(/<link\b[^>]*\/?>/gi, "")
    .replace(/<meta\b[^>]*\/?>/gi, "");

  // Remove self-closing dangerous tags
  sanitized = sanitized
    .replace(/<script\b[^>]*\/>/gi, "")
    .replace(/<iframe\b[^>]*\/>/gi, "");

  // Remove event handler attributes (on*)
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // Remove javascript: and data: protocol URLs in href/src attributes
  sanitized = sanitized.replace(/(href|src|action)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, '$1=""');
  sanitized = sanitized.replace(/(href|src|action)\s*=\s*(?:"data:[^"]*"|'data:[^']*')/gi, '$1=""');

  return sanitized;
}

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
async function isEmailEnabled(shop: string): Promise<boolean> {
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
 * Get customer display name
 */
function getCustomerName(customer: CustomerInfo): string {
  if (customer.firstName && customer.lastName) {
    return `${customer.firstName} ${customer.lastName}`;
  }
  if (customer.firstName) {
    return customer.firstName;
  }
  if (customer.lastName) {
    return customer.lastName;
  }
  return "Valued Customer";
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
    const storeName = await getShopName(shop);
    const customerName = getCustomerName(customer);

    const result = await sendgrid.sendWelcomeEmail(
      shop,
      {
        email: customer.email,
        firstName: customer.firstName || undefined,
        lastName: customer.lastName || undefined,
      },
      {
        name: tier?.name || "Member",
        cashbackPercent: tier?.cashbackPercent || 0,
      }
    );

    if (result.success) {
      console.log(`[EmailNotifications] ✅ Welcome email sent to customer ${customer.id}`);

      // Record email sent for usage tracking
      await recordEmailSent(shop, 1, "transactional");

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
      // Check if this is a SendGrid credits issue (external service limit)
      if (result.error?.includes("Maximum credits exceeded")) {
        console.error(`[EmailNotifications] ⚠️ ALERT: SendGrid credits exhausted! Emails are failing.`);
        console.error(`[EmailNotifications] ⚠️ Action required: Top up SendGrid credits or switch provider.`);
      }
      console.error(`[EmailNotifications] ❌ Failed to send welcome email: ${result.error}`);
      return { success: false, error: result.error };
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
    const storeName = await getShopName(shop);
    const customerName = getCustomerName(customer);

    const result = await sendgrid.sendTierUpgradeEmail(
      shop,
      {
        email: customer.email,
        firstName: customer.firstName || undefined,
      },
      {
        previousTier: previousTier?.name || "None",
        newTier: newTier.name,
        newCashbackPercent: newTier.cashbackPercent,
      }
    );

    if (result.success) {
      console.log(`[EmailNotifications] ✅ Tier upgrade email sent to customer ${customer.id}`);

      // Record email sent for usage tracking
      await recordEmailSent(shop, 1, "transactional");

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
      // Check if this is a SendGrid credits issue (external service limit)
      if (result.error?.includes("Maximum credits exceeded")) {
        console.error(`[EmailNotifications] ⚠️ ALERT: SendGrid credits exhausted! Emails are failing.`);
        console.error(`[EmailNotifications] ⚠️ Action required: Top up SendGrid credits or switch provider.`);
      }
      console.error(`[EmailNotifications] ❌ Failed to send tier upgrade email: ${result.error}`);
      return { success: false, error: result.error };
    }
  } catch (error: any) {
    console.error(`[EmailNotifications] ❌ Error sending tier upgrade email:`, error);
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

  // Send batch emails with custom args for webhook tracking
  const result = await sendgrid.sendBatchEmails(
    shop,
    validRecipients.map((r) => ({ email: r.email, name: r.name })),
    {
      subject: campaign.subject || "Update from us",
      html: htmlContent,
      categories: ["campaign", campaignId],
      customArgs: {
        campaign_id: campaignId,
        shop: shop,
      },
    }
  );

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
    const customerName = data.firstName || "Valued Customer";

    // Build bonus info text
    let bonusInfo = "";
    if (data.tierMultiplier && data.tierMultiplier > 1) {
      bonusInfo += `\n${data.currencyIcon} ${Math.round((data.tierMultiplier - 1) * 100)}% tier bonus applied!`;
    }
    if (data.bonusEvents && data.bonusEvents.length > 0) {
      bonusInfo += `\n${data.currencyIcon} Active promotions: ${data.bonusEvents.join(", ")}`;
    }

    const subject = `You earned ${data.pointsEarned} ${data.currencyName}! ${data.currencyIcon}`;
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Great news, ${customerName}!</h2>
        <p style="font-size: 16px; color: #666;">
          You just earned <strong style="color: #2ecc71; font-size: 24px;">${data.pointsEarned} ${data.currencyName}</strong>
          ${data.orderNumber ? `from your order #${data.orderNumber}` : ""}!
        </p>
        ${bonusInfo ? `<p style="color: #8e44ad; font-size: 14px;">${bonusInfo}</p>` : ""}
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px; text-align: center; margin: 20px 0;">
          <p style="color: white; margin: 0; font-size: 14px;">Your Current Balance</p>
          <p style="color: white; margin: 10px 0 0 0; font-size: 32px; font-weight: bold;">
            ${data.currencyIcon} ${data.totalBalance.toLocaleString()} ${data.currencyName}
          </p>
        </div>
        <p style="color: #666;">Keep shopping to earn more ${data.currencyName.toLowerCase()} and unlock exclusive rewards!</p>
        <p style="color: #999; font-size: 12px;">- The ${storeName} Team</p>
      </div>
    `;

    const result = await sendgrid.sendEmail(shop, {
      to: { email: data.email } as any,
      subject,
      html: htmlContent,
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
    const customerName = data.firstName || "Valued Customer";

    const urgencyColor = data.daysUntilExpiry <= 7 ? "#e74c3c" : "#f39c12";
    const subject = `Don't lose your ${data.pointsExpiring} ${data.currencyName}! Expires in ${data.daysUntilExpiry} days`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${urgencyColor};">Act now, ${customerName}!</h2>
        <div style="background-color: ${urgencyColor}; padding: 20px; border-radius: 10px; text-align: center; margin: 20px 0;">
          <p style="color: white; margin: 0; font-size: 14px;">Points Expiring Soon</p>
          <p style="color: white; margin: 10px 0 0 0; font-size: 32px; font-weight: bold;">
            ${data.currencyIcon} ${data.pointsExpiring.toLocaleString()} ${data.currencyName}
          </p>
          <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">
            in ${data.daysUntilExpiry} day${data.daysUntilExpiry !== 1 ? "s" : ""}
          </p>
        </div>
        <p style="font-size: 16px; color: #666;">
          Your ${data.currencyName.toLowerCase()} are about to expire! Use them before they're gone to get
          exclusive rewards and discounts.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="#" style="background-color: ${urgencyColor}; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            Redeem My ${data.currencyName}
          </a>
        </div>
        <p style="color: #999; font-size: 12px;">- The ${storeName} Team</p>
      </div>
    `;

    const result = await sendgrid.sendEmail(shop, {
      to: { email: data.email } as any,
      subject,
      html: htmlContent,
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
    const customerName = data.firstName || "Valued Customer";

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

    const subject = `Your ${discountText} discount code is ready! ${data.currencyIcon}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Congratulations, ${customerName}! ${data.currencyIcon}</h2>
        <p style="font-size: 16px; color: #666;">
          You've successfully redeemed <strong>${data.pointsSpent.toLocaleString()} ${data.currencyName}</strong>
          for an exclusive discount!
        </p>
        <div style="background-color: #2ecc71; padding: 30px; border-radius: 10px; text-align: center; margin: 20px 0;">
          <p style="color: white; margin: 0; font-size: 14px;">Your Discount Code</p>
          <p style="color: white; margin: 10px 0; font-size: 28px; font-weight: bold; letter-spacing: 3px; font-family: monospace;">
            ${data.discountCode}
          </p>
          <p style="color: white; margin: 10px 0 0 0; font-size: 24px; font-weight: bold;">
            ${discountText}
          </p>
        </div>
        <p style="text-align: center; color: #e74c3c; font-size: 14px;">
          ⏰ Valid until: ${expiryDate}
        </p>
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0; color: #666;">
            <strong>Remaining Balance:</strong> ${data.currencyIcon} ${data.remainingBalance.toLocaleString()} ${data.currencyName}
          </p>
        </div>
        <p style="color: #999; font-size: 12px;">- The ${storeName} Team</p>
      </div>
    `;

    const result = await sendgrid.sendEmail(shop, {
      to: { email: data.email } as any,
      subject,
      html: htmlContent,
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
    const customerName = data.firstName || "Valued Customer";
    const bonusPercent = Math.round((data.bonusMultiplier - 1) * 100);

    const subject = `${data.currencyIcon} ${data.streakDays}-Day Streak! You're on fire!`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #e67e22; text-align: center;">
          🔥 Amazing Streak, ${customerName}! 🔥
        </h2>
        <div style="background: linear-gradient(135deg, #f39c12 0%, #e74c3c 100%); padding: 30px; border-radius: 10px; text-align: center; margin: 20px 0;">
          <p style="color: white; margin: 0; font-size: 48px; font-weight: bold;">
            ${data.streakDays} Days
          </p>
          <p style="color: white; margin: 10px 0 0 0; font-size: 18px;">
            Consecutive Activity Streak
          </p>
        </div>
        <div style="background-color: #27ae60; padding: 20px; border-radius: 10px; text-align: center; margin: 20px 0;">
          <p style="color: white; margin: 0; font-size: 14px;">Your Current Bonus</p>
          <p style="color: white; margin: 5px 0 0 0; font-size: 28px; font-weight: bold;">
            +${bonusPercent}% Extra ${data.currencyName}
          </p>
          <p style="color: white; margin: 5px 0 0 0; font-size: 14px;">on every purchase!</p>
        </div>
        <p style="text-align: center; color: #666; font-size: 16px;">
          Keep the streak alive! Shop today to maintain your bonus.
        </p>
        <p style="color: #999; font-size: 12px; text-align: center;">- The ${storeName} Team</p>
      </div>
    `;

    const result = await sendgrid.sendEmail(shop, {
      to: { email: data.email } as any,
      subject,
      html: htmlContent,
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
    const customerName = data.firstName || "Valued Customer";

    const expiryDate = data.expirationDate.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const urgencyColor = data.daysUntilExpiry <= 3 ? "#e74c3c" : "#f39c12";
    const urgencyText = data.daysUntilExpiry === 1 ? "tomorrow" : `in ${data.daysUntilExpiry} days`;

    // Build benefits list HTML
    const benefitsHtml = data.tierBenefits.length > 0
      ? `
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p style="margin: 0 0 10px 0; font-weight: bold; color: #333;">Benefits you'll lose:</p>
          <ul style="margin: 0; padding-left: 20px; color: #666;">
            ${data.tierBenefits.map(b => `<li style="margin: 5px 0;">${b}</li>`).join('')}
          </ul>
        </div>
      `
      : '';

    const subject = `⚠️ Your ${data.tierName} membership expires ${urgencyText}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${urgencyColor};">Don't lose your ${data.tierName} benefits, ${customerName}!</h2>

        <div style="background-color: ${urgencyColor}; padding: 25px; border-radius: 10px; text-align: center; margin: 20px 0;">
          <p style="color: white; margin: 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Membership Expiring</p>
          <p style="color: white; margin: 10px 0 0 0; font-size: 28px; font-weight: bold;">
            ${data.tierName}
          </p>
          <p style="color: white; margin: 10px 0 0 0; font-size: 18px;">
            ${urgencyText} • ${expiryDate}
          </p>
        </div>

        <p style="font-size: 16px; color: #666; line-height: 1.6;">
          Your ${data.tierName} membership is about to expire. Act now to keep enjoying your exclusive benefits!
        </p>

        ${benefitsHtml}

        ${data.renewalUrl ? `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.renewalUrl}" style="background-color: ${urgencyColor}; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">
            Renew My Membership
          </a>
        </div>
        ` : ''}

        <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px;">
          Questions? Reply to this email or contact our support team.
          <br>- The ${storeName} Team
        </p>
      </div>
    `;

    const result = await sendgrid.sendEmail(shop, {
      to: { email: data.email } as any,
      subject,
      html: htmlContent,
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
    const customerName = data.firstName || "Valued Customer";

    const newTierText = data.newTierName
      ? `You've been moved to <strong>${data.newTierName}</strong> tier.`
      : `Your tier membership has been removed.`;

    const subject = `Your ${data.expiredTierName} membership has expired`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #666;">We miss you, ${customerName}!</h2>

        <div style="background-color: #95a5a6; padding: 25px; border-radius: 10px; text-align: center; margin: 20px 0;">
          <p style="color: white; margin: 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Membership Expired</p>
          <p style="color: white; margin: 10px 0 0 0; font-size: 28px; font-weight: bold;">
            ${data.expiredTierName}
          </p>
        </div>

        <p style="font-size: 16px; color: #666; line-height: 1.6;">
          Your ${data.expiredTierName} membership has expired. ${newTierText}
        </p>

        <p style="font-size: 16px; color: #666; line-height: 1.6;">
          Don't worry - you can renew anytime to get back your exclusive benefits!
        </p>

        ${data.renewalUrl ? `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.renewalUrl}" style="background-color: #3498db; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">
            Renew My Membership
          </a>
        </div>
        ` : ''}

        <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px;">
          - The ${storeName} Team
        </p>
      </div>
    `;

    const result = await sendgrid.sendEmail(shop, {
      to: { email: data.email } as any,
      subject,
      html: htmlContent,
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
