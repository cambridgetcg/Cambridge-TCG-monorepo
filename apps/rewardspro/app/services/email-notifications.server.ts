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
 */

import db from "~/db.server";
import * as sendgrid from "./sendgrid.server";

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
    const shopSettings = await db.shopSettings.findUnique({
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

      // Log email event (optional - for analytics)
      try {
        await db.emailEvent.create({
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

      // Log email event
      try {
        await db.emailEvent.create({
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
  const campaign = await db.emailCampaign.findFirst({
    where: { id: campaignId, shop },
  });

  if (!campaign) {
    return { sent: 0, failed: recipients.length, errors: ["Campaign not found"] };
  }

  // Get template if exists
  let htmlContent = campaign.htmlContent || "";
  if (campaign.templateId) {
    const template = await db.emailTemplate.findFirst({
      where: { id: campaign.templateId, shop },
    });
    if (template?.htmlContent) {
      htmlContent = template.htmlContent;
    }
  }

  if (!htmlContent) {
    return { sent: 0, failed: recipients.length, errors: ["No email content"] };
  }

  // Filter recipients with valid emails
  const validRecipients = recipients.filter((r) => r.email && r.email.includes("@"));

  if (validRecipients.length === 0) {
    return { sent: 0, failed: 0, errors: ["No valid recipients"] };
  }

  // Send batch emails
  const result = await sendgrid.sendBatchEmails(
    shop,
    validRecipients.map((r) => ({ email: r.email, name: r.name })),
    {
      subject: campaign.subject || "Update from us",
      html: htmlContent,
      categories: ["campaign", campaignId],
    }
  );

  // Log campaign send event
  try {
    await db.emailEvent.create({
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

    const result = await sendgrid.sendTransactionalEmail(shop, {
      to: data.email,
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

    const result = await sendgrid.sendTransactionalEmail(shop, {
      to: data.email,
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

    const result = await sendgrid.sendTransactionalEmail(shop, {
      to: data.email,
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

    const result = await sendgrid.sendTransactionalEmail(shop, {
      to: data.email,
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
