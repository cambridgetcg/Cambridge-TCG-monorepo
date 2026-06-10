/**
 * AWS Lambda Function: Email Queue Processor
 *
 * Processes email notifications asynchronously from SQS queue.
 * Supports multiple email types and providers (SendGrid, SES).
 *
 * Features:
 * - Idempotency via message ID tracking (prevents duplicate emails)
 * - Batch processing with partial failure reporting
 * - Automatic retry via SQS with DLQ fallback
 *
 * Message Format:
 * {
 *   "id": "unique-message-id",
 *   "emailType": "WELCOME" | "TIER_UPGRADE" | "POINTS_EARNED" | "POINTS_EXPIRING" | "POINTS_REDEEMED",
 *   "shop": "shop-domain.myshopify.com",
 *   "recipient": {
 *     "email": "customer@example.com",
 *     "firstName": "John",
 *     "lastName": "Doe"
 *   },
 *   "data": { ... email-specific data ... },
 *   "eventType": "CUSTOMER_CREATED" | "ORDER_PAID" | "TIER_UPGRADE" | ... (for SNS filtering)
 * }
 */

const {
  RDSDataClient,
  ExecuteStatementCommand,
} = require("@aws-sdk/client-rds-data");
const crypto = require("crypto");
const { createSendGridRateLimiter, withRateLimit } = require("./lib/rate-limiter");

// Initialize RDS Data API client for idempotency checks
const rdsClient = new RDSDataClient({
  region: process.env.AWS_REGION || "eu-north-1",
});

// Database configuration
const DB_CONFIG = {
  resourceArn: process.env.AURORA_RESOURCE_ARN,
  secretArn: process.env.AURORA_SECRET_ARN,
  database: process.env.AURORA_DATABASE_NAME || "rewardspro",
};

// Initialize rate limiter for SendGrid
const sendGridRateLimiter = createSendGridRateLimiter();

// Use native fetch (available in Node.js 18+)
const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send';

// Configuration from environment
const CONFIG = {
  sendgridApiKey: process.env.SENDGRID_API_KEY,
  sendgridFromEmail: process.env.SENDGRID_FROM_EMAIL || 'noreply@rewards.pro',
  sesFromEmail: process.env.SES_FROM_EMAIL,
  emailProvider: process.env.EMAIL_PROVIDER || 'sendgrid'
};

/**
 * Main Lambda handler - processes batch of SQS messages
 */
exports.handler = async (event) => {
  console.log(`[Email Processor] Processing ${event.Records.length} messages`);

  const batchItemFailures = [];

  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.body);
      const messageId = message.id || record.messageId;

      console.log(`[Email Processor] Processing email type: ${message.emailType} for ${message.recipient?.email}`);

      // Idempotency check - prevent duplicate emails
      const idempotencyKey = `EMAIL-${messageId}`;
      const alreadyProcessed = await checkIdempotency(idempotencyKey);
      if (alreadyProcessed) {
        console.log(`[Email Processor] Message ${messageId} already processed, skipping`);
        continue;
      }

      await processEmailMessage(message);

      // Mark as processed for idempotency
      await markProcessed(idempotencyKey, message.shop, `EMAIL_${message.emailType}`);

      console.log(`[Email Processor] Successfully sent ${message.emailType} email to ${message.recipient?.email}`);
    } catch (error) {
      console.error(`[Email Processor] Failed to process message:`, error);
      console.error(`[Email Processor] Message body:`, record.body);

      // Report this item as failed for retry
      batchItemFailures.push({
        itemIdentifier: record.messageId
      });
    }
  }

  // Return batch item failures for partial batch response
  return {
    batchItemFailures
  };
};

/**
 * Process a single email message based on type
 */
async function processEmailMessage(message) {
  const { emailType, shop, recipient, data } = message;

  if (!recipient?.email) {
    console.log(`[Email Processor] Skipping - no recipient email`);
    return;
  }

  // Generate email content based on type
  const emailContent = generateEmailContent(emailType, recipient, data, shop);

  if (!emailContent) {
    console.log(`[Email Processor] Skipping - unsupported email type: ${emailType}`);
    return;
  }

  // Send via configured provider
  if (CONFIG.emailProvider === 'sendgrid' && CONFIG.sendgridApiKey) {
    await sendViaSendGrid(emailContent);
  } else {
    console.warn(`[Email Processor] No email provider configured, skipping send`);
  }
}

/**
 * Generate email content based on type
 */
function generateEmailContent(emailType, recipient, data, shop) {
  const customerName = recipient.firstName || 'Valued Customer';
  const storeName = shop?.replace('.myshopify.com', '') || 'Our Store';

  switch (emailType) {
    case 'WELCOME':
      return {
        to: recipient.email,
        subject: `Welcome to ${storeName}'s Rewards Program!`,
        html: generateWelcomeEmail(customerName, storeName, data)
      };

    case 'TIER_UPGRADE':
      return {
        to: recipient.email,
        subject: `Congratulations! You've been upgraded to ${data.newTier}!`,
        html: generateTierUpgradeEmail(customerName, storeName, data)
      };

    case 'POINTS_EARNED':
      return {
        to: recipient.email,
        subject: `You earned ${data.pointsEarned} ${data.currencyName || 'points'}!`,
        html: generatePointsEarnedEmail(customerName, storeName, data)
      };

    case 'POINTS_EXPIRING':
      return {
        to: recipient.email,
        subject: `Your ${data.pointsExpiring} ${data.currencyName || 'points'} are expiring soon!`,
        html: generatePointsExpiringEmail(customerName, storeName, data)
      };

    case 'POINTS_REDEEMED':
      return {
        to: recipient.email,
        subject: `Your discount code is ready!`,
        html: generatePointsRedeemedEmail(customerName, storeName, data)
      };

    default:
      return null;
  }
}

/**
 * Send email via SendGrid with rate limiting
 */
async function sendViaSendGrid(emailContent) {
  // Use rate limiter to prevent hitting SendGrid limits
  const response = await withRateLimit(
    sendGridRateLimiter,
    async () => {
      return fetch(SENDGRID_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CONFIG.sendgridApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          personalizations: [{
            to: [{ email: emailContent.to }]
          }],
          from: { email: CONFIG.sendgridFromEmail },
          subject: emailContent.subject,
          content: [{
            type: 'text/html',
            value: emailContent.html
          }]
        })
      });
    },
    { cost: 1, maxRetries: 3, maxWaitMs: 30000 }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`SendGrid API error: ${response.status} - ${error}`);
  }

  return { success: true };
}

// =============================================================================
// Email Templates
// =============================================================================

function generateWelcomeEmail(customerName, storeName, data) {
  const tierName = data?.tierName || 'Member';
  const cashbackPercent = data?.cashbackPercent || 0;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">Welcome to ${storeName}, ${customerName}!</h2>
      <p style="font-size: 16px; color: #666; line-height: 1.5;">
        Thank you for joining our rewards program. We're excited to have you!
      </p>
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px; text-align: center; margin: 20px 0;">
        <p style="color: white; margin: 0; font-size: 14px;">Your Starting Tier</p>
        <p style="color: white; margin: 10px 0; font-size: 24px; font-weight: bold;">${tierName}</p>
        <p style="color: white; margin: 0; font-size: 16px;">${cashbackPercent}% cashback on every purchase</p>
      </div>
      <p style="font-size: 14px; color: #666;">
        Start shopping to earn rewards and unlock exclusive benefits!
      </p>
      <p style="color: #999; font-size: 12px;">- The ${storeName} Team</p>
    </div>
  `;
}

function generateTierUpgradeEmail(customerName, storeName, data) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #2ecc71;">Congratulations, ${customerName}!</h2>
      <p style="font-size: 16px; color: #666; line-height: 1.5;">
        You've been upgraded from <strong>${data.previousTier || 'your previous tier'}</strong> to:
      </p>
      <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 30px; border-radius: 10px; text-align: center; margin: 20px 0;">
        <p style="color: white; margin: 0; font-size: 32px; font-weight: bold;">${data.newTier}</p>
        <p style="color: white; margin: 10px 0 0 0; font-size: 18px;">${data.newCashbackPercent || 0}% cashback</p>
      </div>
      <p style="font-size: 14px; color: #666;">
        Enjoy your new benefits and keep shopping to unlock even more rewards!
      </p>
      <p style="color: #999; font-size: 12px;">- The ${storeName} Team</p>
    </div>
  `;
}

function generatePointsEarnedEmail(customerName, storeName, data) {
  const currencyIcon = data.currencyIcon || '';
  const currencyName = data.currencyName || 'points';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">Great news, ${customerName}!</h2>
      <p style="font-size: 16px; color: #666; line-height: 1.5;">
        You just earned <strong style="color: #2ecc71; font-size: 20px;">${data.pointsEarned} ${currencyName}</strong>
        ${data.orderNumber ? ` from your order #${data.orderNumber}` : ''}!
      </p>
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px; text-align: center; margin: 20px 0;">
        <p style="color: white; margin: 0; font-size: 14px;">Your Current Balance</p>
        <p style="color: white; margin: 10px 0 0 0; font-size: 32px; font-weight: bold;">
          ${currencyIcon} ${(data.totalBalance || 0).toLocaleString()} ${currencyName}
        </p>
      </div>
      <p style="font-size: 14px; color: #666;">
        Keep shopping to earn more ${currencyName.toLowerCase()} and unlock exclusive rewards!
      </p>
      <p style="color: #999; font-size: 12px;">- The ${storeName} Team</p>
    </div>
  `;
}

function generatePointsExpiringEmail(customerName, storeName, data) {
  const urgencyColor = data.daysUntilExpiry <= 7 ? '#e74c3c' : '#f39c12';
  const currencyName = data.currencyName || 'points';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: ${urgencyColor};">Act now, ${customerName}!</h2>
      <div style="background-color: ${urgencyColor}; padding: 20px; border-radius: 10px; text-align: center; margin: 20px 0;">
        <p style="color: white; margin: 0; font-size: 14px;">${currencyName} Expiring Soon</p>
        <p style="color: white; margin: 10px 0; font-size: 32px; font-weight: bold;">
          ${(data.pointsExpiring || 0).toLocaleString()} ${currencyName}
        </p>
        <p style="color: white; margin: 0; font-size: 16px;">
          in ${data.daysUntilExpiry} day${data.daysUntilExpiry !== 1 ? 's' : ''}
        </p>
      </div>
      <p style="font-size: 16px; color: #666; line-height: 1.5;">
        Don't let your ${currencyName.toLowerCase()} go to waste! Use them before they expire.
      </p>
      <p style="color: #999; font-size: 12px;">- The ${storeName} Team</p>
    </div>
  `;
}

function generatePointsRedeemedEmail(customerName, storeName, data) {
  let discountText = '';
  if (data.discountType === 'fixed') {
    discountText = `$${data.discountValue} OFF`;
  } else if (data.discountType === 'percentage') {
    discountText = `${data.discountValue}% OFF`;
  } else {
    discountText = 'FREE SHIPPING';
  }

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">Congratulations, ${customerName}!</h2>
      <p style="font-size: 16px; color: #666; line-height: 1.5;">
        You've successfully redeemed <strong>${(data.pointsSpent || 0).toLocaleString()} ${data.currencyName || 'points'}</strong>!
      </p>
      <div style="background-color: #2ecc71; padding: 30px; border-radius: 10px; text-align: center; margin: 20px 0;">
        <p style="color: white; margin: 0; font-size: 14px;">Your Discount Code</p>
        <p style="color: white; margin: 10px 0; font-size: 28px; font-weight: bold; letter-spacing: 3px; font-family: monospace;">
          ${data.discountCode || 'CODE'}
        </p>
        <p style="color: white; margin: 10px 0 0 0; font-size: 24px; font-weight: bold;">
          ${discountText}
        </p>
      </div>
      <p style="text-align: center; color: #e74c3c; font-size: 14px;">
        Valid until: ${data.expiresAt ? new Date(data.expiresAt).toLocaleDateString() : 'Limited time'}
      </p>
      <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p style="margin: 0; color: #666;">
          <strong>Remaining Balance:</strong> ${(data.remainingBalance || 0).toLocaleString()} ${data.currencyName || 'points'}
        </p>
      </div>
      <p style="color: #999; font-size: 12px;">- The ${storeName} Team</p>
    </div>
  `;
}

// =============================================================================
// Idempotency Helpers
// =============================================================================

/**
 * Check if a message has already been processed
 */
async function checkIdempotency(idempotencyKey) {
  try {
    const result = await rdsClient.send(
      new ExecuteStatementCommand({
        ...DB_CONFIG,
        sql: `SELECT id FROM "WebhookProcessed" WHERE "idempotencyKey" = :key`,
        parameters: [{ name: "key", value: { stringValue: idempotencyKey } }],
      })
    );
    return result.records && result.records.length > 0;
  } catch (error) {
    console.error(`[Email Processor] Idempotency check failed:`, error);
    // On error, allow processing (fail open for availability)
    return false;
  }
}

/**
 * Mark a message as processed for idempotency
 */
async function markProcessed(idempotencyKey, shop, eventType) {
  try {
    const id = crypto.randomUUID();
    await rdsClient.send(
      new ExecuteStatementCommand({
        ...DB_CONFIG,
        sql: `
          INSERT INTO "WebhookProcessed" (id, "idempotencyKey", shop, "eventType", "processedAt", "createdAt")
          VALUES (:id, :key, :shop, :eventType, NOW(), NOW())
          ON CONFLICT ("idempotencyKey") DO NOTHING
        `,
        parameters: [
          { name: "id", value: { stringValue: id } },
          { name: "key", value: { stringValue: idempotencyKey } },
          { name: "shop", value: { stringValue: shop || "unknown" } },
          { name: "eventType", value: { stringValue: eventType } },
        ],
      })
    );
  } catch (error) {
    console.error(`[Email Processor] Failed to mark as processed:`, error);
    // Don't throw - the email was sent successfully
  }
}

// Export for testing
module.exports = {
  handler: exports.handler,
  processEmailMessage,
  generateEmailContent,
  checkIdempotency,
  markProcessed
};
