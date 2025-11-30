/**
 * SendGrid Email Service
 *
 * Handles all email sending operations through SendGrid, including:
 * - Transactional emails (welcome, tier changes, etc.)
 * - Marketing campaigns
 * - Domain authentication for branded sending
 *
 * @see https://docs.sendgrid.com/api-reference
 */

import db from "~/db.server";

// ============================================
// TYPES
// ============================================

interface EmailRecipient {
  email: string;
  name?: string;
}

interface EmailAttachment {
  content: string; // Base64 encoded
  filename: string;
  type: string;
  disposition?: "attachment" | "inline";
}

interface SendEmailParams {
  to: EmailRecipient | EmailRecipient[];
  subject: string;
  html: string;
  text?: string;
  from?: EmailRecipient;
  replyTo?: EmailRecipient;
  attachments?: EmailAttachment[];
  categories?: string[];
  customArgs?: Record<string, string>;
  sendAt?: number; // Unix timestamp
  templateId?: string;
  dynamicTemplateData?: Record<string, any>;
}

interface SendGridResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  statusCode?: number;
}

interface DomainAuthenticationParams {
  domain: string;
  subdomain?: string;
  automaticSecurity?: boolean;
  customSpf?: boolean;
}

interface DnsRecord {
  type: string;
  host: string;
  data: string;
  valid: boolean;
}

interface DomainAuthResponse {
  id: number;
  domain: string;
  subdomain: string;
  valid: boolean;
  dns: {
    dkim1: DnsRecord;
    dkim2: DnsRecord;
    mail_cname: DnsRecord;
  };
}

interface DomainValidationResponse {
  id: number;
  valid: boolean;
  validation_results: {
    dkim1: { valid: boolean; reason: string | null };
    dkim2: { valid: boolean; reason: string | null };
    mail_cname: { valid: boolean; reason: string | null };
  };
}

// ============================================
// CONFIGURATION
// ============================================

const SENDGRID_API_URL = "https://api.sendgrid.com/v3";

// Default sender for shared domain mode
const DEFAULT_SENDER = {
  email: "rewards@rewardspro.io",
  name: "RewardsPro",
};

function getSendGridApiKey(): string {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error("SENDGRID_API_KEY environment variable is not set");
  }
  return apiKey;
}

// ============================================
// API HELPERS
// ============================================

async function sendGridRequest<T>(
  endpoint: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: any
): Promise<{ data: T | null; error: string | null; statusCode: number }> {
  try {
    const response = await fetch(`${SENDGRID_API_URL}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${getSendGridApiKey()}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const statusCode = response.status;

    // Handle empty responses (202 for send, 204 for delete)
    if (statusCode === 202 || statusCode === 204) {
      return { data: null, error: null, statusCode };
    }

    // Parse response
    const text = await response.text();
    let data: any = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text };
      }
    }

    if (!response.ok) {
      const errorMessage =
        data?.errors?.[0]?.message || data?.message || `HTTP ${statusCode}`;
      console.error("[SendGrid] API Error:", errorMessage, data);
      return { data: null, error: errorMessage, statusCode };
    }

    return { data, error: null, statusCode };
  } catch (error: any) {
    console.error("[SendGrid] Request failed:", error.message);
    return { data: null, error: error.message, statusCode: 500 };
  }
}

// ============================================
// EMAIL SENDING
// ============================================

/**
 * Send an email through SendGrid
 */
export async function sendEmail(
  shop: string,
  params: SendEmailParams
): Promise<SendGridResponse> {
  console.log("[SendGrid] Sending email to:", params.to);

  try {
    // Get email settings for the shop
    const emailSettings = await db.emailSettings.findUnique({
      where: { shop },
    });

    // Get custom domain if configured
    let customDomain = null;
    if (emailSettings?.customDomainId) {
      customDomain = await db.sendGridDomain.findFirst({
        where: { id: emailSettings.customDomainId, shop },
      });
    }

    // Determine sender based on sending mode
    let sender = params.from || DEFAULT_SENDER;

    if (emailSettings) {
      // Use custom domain if configured and verified
      if (
        emailSettings.sendingMode === "CUSTOM_DOMAIN" &&
        customDomain?.status === "VERIFIED"
      ) {
        sender = {
          email: emailSettings.senderEmail,
          name: emailSettings.senderName,
        };
      } else if (emailSettings.sendingMode === "SHARED") {
        // Shared mode: use RewardsPro domain with merchant's name
        sender = {
          email: DEFAULT_SENDER.email,
          name: emailSettings.senderName || DEFAULT_SENDER.name,
        };
      }
    }

    // Build the email payload
    const payload: any = {
      personalizations: [
        {
          to: Array.isArray(params.to) ? params.to : [params.to],
          ...(params.dynamicTemplateData && {
            dynamic_template_data: params.dynamicTemplateData,
          }),
        },
      ],
      from: sender,
      subject: params.subject,
      content: [
        ...(params.text ? [{ type: "text/plain", value: params.text }] : []),
        { type: "text/html", value: params.html },
      ],
    };

    // Add reply-to if specified
    if (params.replyTo) {
      payload.reply_to = params.replyTo;
    } else if (emailSettings?.replyToEmail) {
      payload.reply_to = { email: emailSettings.replyToEmail };
    }

    // Add categories for tracking
    if (params.categories) {
      payload.categories = params.categories;
    }

    // Add custom args for webhook tracking
    if (params.customArgs) {
      payload.personalizations[0].custom_args = params.customArgs;
    }

    // Add attachments
    if (params.attachments?.length) {
      payload.attachments = params.attachments;
    }

    // Schedule for later
    if (params.sendAt) {
      payload.send_at = params.sendAt;
    }

    // Use SendGrid template
    if (params.templateId) {
      payload.template_id = params.templateId;
    }

    // Add tracking settings
    payload.tracking_settings = {
      click_tracking: { enable: true },
      open_tracking: { enable: true },
    };

    // Send the email
    const { error, statusCode } = await sendGridRequest<void>(
      "/mail/send",
      "POST",
      payload
    );

    if (error) {
      console.error("[SendGrid] Send failed:", error);
      return { success: false, error, statusCode };
    }

    console.log("[SendGrid] Email sent successfully");
    return { success: true, statusCode };
  } catch (error: any) {
    console.error("[SendGrid] Send error:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send a batch of emails (for campaigns)
 */
export async function sendBatchEmails(
  shop: string,
  recipients: EmailRecipient[],
  params: Omit<SendEmailParams, "to">
): Promise<{ sent: number; failed: number; errors: string[] }> {
  console.log(`[SendGrid] Sending batch of ${recipients.length} emails`);

  const results = { sent: 0, failed: 0, errors: [] as string[] };

  // SendGrid supports up to 1000 recipients per request
  const batchSize = 1000;

  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);

    const result = await sendEmail(shop, {
      ...params,
      to: batch,
    });

    if (result.success) {
      results.sent += batch.length;
    } else {
      results.failed += batch.length;
      if (result.error) {
        results.errors.push(result.error);
      }
    }

    // Rate limiting: wait between batches
    if (i + batchSize < recipients.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  console.log(
    `[SendGrid] Batch complete: ${results.sent} sent, ${results.failed} failed`
  );
  return results;
}

// ============================================
// DOMAIN AUTHENTICATION
// ============================================

/**
 * Create a new domain authentication in SendGrid
 */
export async function createDomainAuthentication(
  params: DomainAuthenticationParams
): Promise<{ success: boolean; data?: DomainAuthResponse; error?: string }> {
  console.log("[SendGrid] Creating domain authentication for:", params.domain);

  const { data, error } = await sendGridRequest<DomainAuthResponse>(
    "/whitelabel/domains",
    "POST",
    {
      domain: params.domain,
      subdomain: params.subdomain || "mail",
      automatic_security: params.automaticSecurity ?? true,
      custom_spf: params.customSpf ?? false,
      default: false,
    }
  );

  if (error) {
    return { success: false, error };
  }

  return { success: true, data: data! };
}

/**
 * Validate domain authentication (check DNS records)
 */
export async function validateDomainAuthentication(
  domainId: string
): Promise<{ success: boolean; data?: DomainValidationResponse; error?: string }> {
  console.log("[SendGrid] Validating domain:", domainId);

  const { data, error } = await sendGridRequest<DomainValidationResponse>(
    `/whitelabel/domains/${domainId}/validate`,
    "POST"
  );

  if (error) {
    return { success: false, error };
  }

  return { success: true, data: data! };
}

/**
 * Get domain authentication details
 */
export async function getDomainAuthentication(
  domainId: string
): Promise<{ success: boolean; data?: DomainAuthResponse; error?: string }> {
  const { data, error } = await sendGridRequest<DomainAuthResponse>(
    `/whitelabel/domains/${domainId}`
  );

  if (error) {
    return { success: false, error };
  }

  return { success: true, data: data! };
}

/**
 * List all domain authentications
 */
export async function listDomainAuthentications(): Promise<{
  success: boolean;
  data?: DomainAuthResponse[];
  error?: string;
}> {
  const { data, error } = await sendGridRequest<DomainAuthResponse[]>(
    "/whitelabel/domains"
  );

  if (error) {
    return { success: false, error };
  }

  return { success: true, data: data! };
}

/**
 * Delete a domain authentication
 */
export async function deleteDomainAuthentication(
  domainId: string
): Promise<{ success: boolean; error?: string }> {
  console.log("[SendGrid] Deleting domain:", domainId);

  const { error } = await sendGridRequest<void>(
    `/whitelabel/domains/${domainId}`,
    "DELETE"
  );

  if (error) {
    return { success: false, error };
  }

  return { success: true };
}

// ============================================
// HIGH-LEVEL DOMAIN MANAGEMENT
// ============================================

/**
 * Set up a custom sending domain for a merchant
 * This creates the domain in SendGrid and saves the DNS records to our database
 */
export async function setupCustomDomain(
  shop: string,
  domain: string,
  subdomain?: string
): Promise<{
  success: boolean;
  domainId?: string;
  dnsRecords?: any;
  error?: string;
}> {
  console.log(`[SendGrid] Setting up custom domain ${domain} for ${shop}`);

  try {
    // Create domain authentication in SendGrid
    const result = await createDomainAuthentication({
      domain,
      subdomain,
      automaticSecurity: true,
    });

    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }

    const sendgridData = result.data;

    // Save to our database
    const sendgridDomain = await db.sendGridDomain.create({
      data: {
        shop,
        domain,
        subdomain: subdomain || "mail",
        sendgridDomainId: String(sendgridData.id),
        sendgridDnsRecords: sendgridData.dns,
        status: "DNS_PENDING",
      },
    });

    console.log("[SendGrid] Domain setup complete, DNS records provided");

    return {
      success: true,
      domainId: sendgridDomain.id,
      dnsRecords: sendgridData.dns,
    };
  } catch (error: any) {
    console.error("[SendGrid] Setup error:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Verify a custom domain's DNS records
 */
export async function verifyCustomDomain(
  shop: string,
  domainId: string
): Promise<{
  success: boolean;
  verified: boolean;
  results?: any;
  error?: string;
}> {
  console.log(`[SendGrid] Verifying domain ${domainId} for ${shop}`);

  try {
    // Get the domain from our database
    const domain = await db.sendGridDomain.findFirst({
      where: { id: domainId, shop },
    });

    if (!domain) {
      return { success: false, verified: false, error: "Domain not found" };
    }

    if (!domain.sendgridDomainId) {
      return {
        success: false,
        verified: false,
        error: "Domain not set up in SendGrid",
      };
    }

    // Update status to verifying
    await db.sendGridDomain.update({
      where: { id: domainId },
      data: { status: "VERIFYING", lastCheckedAt: new Date() },
    });

    // Validate with SendGrid
    const result = await validateDomainAuthentication(domain.sendgridDomainId);

    if (!result.success || !result.data) {
      await db.sendGridDomain.update({
        where: { id: domainId },
        data: {
          status: "DNS_PENDING",
          lastError: result.error,
          errorCount: { increment: 1 },
        },
      });
      return { success: false, verified: false, error: result.error };
    }

    const validationData = result.data;
    const isVerified = validationData.valid;

    // Update our database with verification results
    await db.sendGridDomain.update({
      where: { id: domainId },
      data: {
        status: isVerified ? "VERIFIED" : "DNS_PENDING",
        verifiedAt: isVerified ? new Date() : null,
        dkimVerified:
          validationData.validation_results.dkim1.valid &&
          validationData.validation_results.dkim2.valid,
        spfVerified: validationData.validation_results.mail_cname.valid,
        lastError: isVerified ? null : "DNS records not fully verified",
        errorCount: isVerified ? 0 : { increment: 1 },
      },
    });

    console.log(`[SendGrid] Domain verification result: ${isVerified}`);

    return {
      success: true,
      verified: isVerified,
      results: validationData.validation_results,
    };
  } catch (error: any) {
    console.error("[SendGrid] Verification error:", error.message);
    return { success: false, verified: false, error: error.message };
  }
}

/**
 * Remove a custom domain
 */
export async function removeCustomDomain(
  shop: string,
  domainId: string
): Promise<{ success: boolean; error?: string }> {
  console.log(`[SendGrid] Removing domain ${domainId} for ${shop}`);

  try {
    const domain = await db.sendGridDomain.findFirst({
      where: { id: domainId, shop },
    });

    if (!domain) {
      return { success: false, error: "Domain not found" };
    }

    // Delete from SendGrid if it exists there
    if (domain.sendgridDomainId) {
      await deleteDomainAuthentication(domain.sendgridDomainId);
    }

    // Update any email settings using this domain
    await db.emailSettings.updateMany({
      where: { customDomainId: domainId },
      data: { customDomainId: null, sendingMode: "SHARED" },
    });

    // Delete from our database
    await db.sendGridDomain.delete({
      where: { id: domainId },
    });

    console.log("[SendGrid] Domain removed successfully");
    return { success: true };
  } catch (error: any) {
    console.error("[SendGrid] Remove error:", error.message);
    return { success: false, error: error.message };
  }
}

// ============================================
// TEMPLATE EMAILS
// ============================================

/**
 * Send a welcome email to a new customer
 */
export async function sendWelcomeEmail(
  shop: string,
  customer: { email: string; firstName?: string; lastName?: string },
  tierInfo: { name: string; cashbackPercent: number }
): Promise<SendGridResponse> {
  const emailSettings = await db.emailSettings.findUnique({
    where: { shop },
  });

  const shopSettings = await db.shopSettings.findUnique({
    where: { shop },
  });

  const storeName = shopSettings?.storeName || "Our Store";
  const customerName = customer.firstName || "Valued Customer";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f4;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px;">
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; color: #333333; font-size: 24px;">
                Welcome to ${storeName} Rewards!
              </h1>
              <p style="margin: 0 0 20px; color: #666666; line-height: 1.6;">
                Hi ${customerName},
              </p>
              <p style="margin: 0 0 20px; color: #666666; line-height: 1.6;">
                Thank you for joining our loyalty program! You've been enrolled in the
                <strong>${tierInfo.name}</strong> tier with <strong>${tierInfo.cashbackPercent}%</strong> cashback
                on all your purchases.
              </p>
              <p style="margin: 0 0 30px; color: #666666; line-height: 1.6;">
                Start shopping now to earn rewards on every order!
              </p>
              <p style="margin: 0;">
                <a href="${shopSettings?.storeUrl || "#"}"
                   style="display: inline-block; padding: 12px 24px; background-color: ${
                     (emailSettings?.brandColors as any)?.primary || "#5C6AC4"
                   }; color: #ffffff; text-decoration: none; border-radius: 4px;">
                  Shop Now
                </a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background-color: #f9f9f9; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #999999; font-size: 12px; text-align: center;">
                ${(emailSettings?.footerContent as any)?.text || `© ${new Date().getFullYear()} ${storeName}. All rights reserved.`}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return sendEmail(shop, {
    to: { email: customer.email, name: customerName },
    subject: `Welcome to ${storeName} Rewards!`,
    html,
    categories: ["welcome", "transactional"],
    customArgs: { shop, type: "welcome" },
  });
}

/**
 * Send a tier upgrade notification
 */
export async function sendTierUpgradeEmail(
  shop: string,
  customer: { email: string; firstName?: string },
  tierInfo: {
    previousTier: string;
    newTier: string;
    newCashbackPercent: number;
  }
): Promise<SendGridResponse> {
  const emailSettings = await db.emailSettings.findUnique({
    where: { shop },
  });

  const shopSettings = await db.shopSettings.findUnique({
    where: { shop },
  });

  const storeName = shopSettings?.storeName || "Our Store";
  const customerName = customer.firstName || "Valued Customer";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f4;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px;">
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; color: #333333; font-size: 24px;">
                Congratulations on Your Tier Upgrade!
              </h1>
              <p style="margin: 0 0 20px; color: #666666; line-height: 1.6;">
                Hi ${customerName},
              </p>
              <p style="margin: 0 0 20px; color: #666666; line-height: 1.6;">
                Great news! You've been upgraded from <strong>${tierInfo.previousTier}</strong>
                to <strong>${tierInfo.newTier}</strong>!
              </p>
              <p style="margin: 0 0 20px; color: #666666; line-height: 1.6;">
                You now earn <strong>${tierInfo.newCashbackPercent}%</strong> cashback on every purchase.
              </p>
              <p style="margin: 0 0 30px; color: #666666; line-height: 1.6;">
                Keep shopping to unlock even more rewards!
              </p>
              <p style="margin: 0;">
                <a href="${shopSettings?.storeUrl || "#"}"
                   style="display: inline-block; padding: 12px 24px; background-color: ${
                     (emailSettings?.brandColors as any)?.primary || "#5C6AC4"
                   }; color: #ffffff; text-decoration: none; border-radius: 4px;">
                  Start Earning More
                </a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background-color: #f9f9f9; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #999999; font-size: 12px; text-align: center;">
                ${(emailSettings?.footerContent as any)?.text || `© ${new Date().getFullYear()} ${storeName}. All rights reserved.`}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return sendEmail(shop, {
    to: { email: customer.email, name: customerName },
    subject: `You've been upgraded to ${tierInfo.newTier}!`,
    html,
    categories: ["tier_upgrade", "transactional"],
    customArgs: { shop, type: "tier_upgrade" },
  });
}

/**
 * Send a test email to verify configuration
 */
export async function sendTestEmail(
  shop: string,
  toEmail: string
): Promise<SendGridResponse> {
  const shopSettings = await db.shopSettings.findUnique({
    where: { shop },
  });

  const storeName = shopSettings?.storeName || "Your Store";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f4;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px;">
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; color: #333333; font-size: 24px;">
                Test Email from RewardsPro
              </h1>
              <p style="margin: 0 0 20px; color: #666666; line-height: 1.6;">
                This is a test email to verify your SendGrid configuration is working correctly.
              </p>
              <p style="margin: 0 0 20px; color: #666666; line-height: 1.6;">
                <strong>Store:</strong> ${storeName}<br>
                <strong>Shop:</strong> ${shop}<br>
                <strong>Sent at:</strong> ${new Date().toISOString()}
              </p>
              <p style="margin: 0; color: #008060; font-weight: bold;">
                Your email configuration is working!
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return sendEmail(shop, {
    to: { email: toEmail },
    subject: `[Test] Email Configuration Test - ${storeName}`,
    html,
    categories: ["test"],
    customArgs: { shop, type: "test" },
  });
}

// ============================================
// EXPORTS
// ============================================

export const sendgrid = {
  // Email sending
  sendEmail,
  sendBatchEmails,
  sendTestEmail,

  // Template emails
  sendWelcomeEmail,
  sendTierUpgradeEmail,

  // Domain authentication
  createDomainAuthentication,
  validateDomainAuthentication,
  getDomainAuthentication,
  listDomainAuthentications,
  deleteDomainAuthentication,

  // High-level domain management
  setupCustomDomain,
  verifyCustomDomain,
  removeCustomDomain,
};

export default sendgrid;
