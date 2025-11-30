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
  console.log(`[EmailNotifications] Attempting to send welcome email to ${customer.email}`);

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
      console.log(`[EmailNotifications] ✅ Welcome email sent to ${customer.email}`);

      // Log email event (optional - for analytics)
      try {
        await db.emailEvent.create({
          data: {
            id: crypto.randomUUID(),
            shop,
            type: "WELCOME",
            recipientEmail: customer.email,
            status: "SENT",
            metadata: { customerId: customer.id, tierName: tier?.name },
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
  console.log(`[EmailNotifications] Attempting to send tier upgrade email to ${customer.email}`);

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
      console.log(`[EmailNotifications] ✅ Tier upgrade email sent to ${customer.email}`);

      // Log email event
      try {
        await db.emailEvent.create({
          data: {
            id: crypto.randomUUID(),
            shop,
            type: "TIER_UPGRADE",
            recipientEmail: customer.email,
            status: "SENT",
            metadata: {
              customerId: customer.id,
              previousTierName: previousTier?.name,
              newTierName: newTier.name,
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
        type: "CAMPAIGN",
        campaignId,
        status: result.sent > 0 ? "SENT" : "FAILED",
        metadata: {
          sent: result.sent,
          failed: result.failed,
          totalRecipients: validRecipients.length,
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
