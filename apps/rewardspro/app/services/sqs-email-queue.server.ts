/**
 * SQS Email Queue Service
 *
 * Production-grade email queue using AWS SQS for async email processing.
 * Decouples email sending from webhook processing to prevent blocking
 * and ensure reliable delivery.
 *
 * Architecture:
 * ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐
 * │  Webhook    │───►│ SQS Queue   │───►│ Lambda Consumer │
 * │  Handler    │    │             │    │ (SendGrid/SES)  │
 * └─────────────┘    └──────┬──────┘    └─────────────────┘
 *                           │ (3 failures)
 *                    ┌──────▼──────┐
 *                    │   DLQ       │
 *                    │ (review)    │
 *                    └─────────────┘
 *
 * Message Types:
 * - WELCOME: New customer welcome email
 * - TIER_UPGRADE: Tier upgrade notification
 * - POINTS_EARNED: Points earned notification
 * - POINTS_EXPIRING: Points expiration warning
 * - POINTS_REDEEMED: Discount code delivery
 */

import {
  SendMessageCommand,
  GetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import { getSQSClient, getAWSConfig } from "~/utils/aws-clients.server";
import { v4 as uuidv4 } from "uuid";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Email types supported by the queue
 */
export type EmailType =
  | "WELCOME"
  | "TIER_UPGRADE"
  | "POINTS_EARNED"
  | "POINTS_EXPIRING"
  | "POINTS_REDEEMED"
  | "CAMPAIGN";

/**
 * Base email message structure
 */
export interface EmailQueueMessage {
  id: string;
  emailType: EmailType;
  shop: string;
  recipient: {
    email: string;
    firstName?: string;
    lastName?: string;
  };
  data: Record<string, any>;
  createdAt: string;
  metadata?: {
    traceId?: string;
    source?: string;
  };
  // For SNS filtering (when message comes via SNS)
  eventType?: string;
}

/**
 * Welcome email data
 */
export interface WelcomeEmailData {
  tierName: string;
  cashbackPercent: number;
}

/**
 * Tier upgrade email data
 */
export interface TierUpgradeEmailData {
  previousTier: string | null;
  newTier: string;
  newCashbackPercent: number;
}

/**
 * Points earned email data
 */
export interface PointsEarnedEmailData {
  pointsEarned: number;
  totalBalance: number;
  orderNumber?: string;
  currencyName: string;
  currencyIcon: string;
  tierMultiplier?: number;
  bonusEvents?: string[];
}

/**
 * Points expiring email data
 */
export interface PointsExpiringEmailData {
  pointsExpiring: number;
  daysUntilExpiry: number;
  currencyName: string;
  currencyIcon: string;
}

/**
 * Points redeemed email data
 */
export interface PointsRedeemedEmailData {
  pointsSpent: number;
  remainingBalance: number;
  discountCode: string;
  discountValue: number;
  discountType: "fixed" | "percentage" | "shipping";
  expiresAt: string;
  currencyName: string;
  currencyIcon: string;
}

/**
 * Queue statistics
 */
export interface EmailQueueStats {
  approximateNumberOfMessages: number;
  approximateNumberOfMessagesNotVisible: number;
  approximateNumberOfMessagesDelayed: number;
  dlqMessages?: number;
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

/**
 * SQS Email Queue Service
 */
export class SQSEmailQueueService {
  private static instance: SQSEmailQueueService | null = null;

  private queueUrl: string;
  private dlqUrl: string;
  private enabled: boolean;

  private constructor() {
    const config = getAWSConfig();
    this.queueUrl = config.emailQueue.queueUrl;
    this.dlqUrl = config.emailQueue.dlqUrl;
    this.enabled = config.emailQueue.enabled && !!this.queueUrl;

    if (this.enabled) {
      console.log(`[SQS Email] Queue initialized: ${this.queueUrl}`);
    } else {
      console.log("[SQS Email] Queue disabled or not configured");
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): SQSEmailQueueService {
    if (!SQSEmailQueueService.instance) {
      SQSEmailQueueService.instance = new SQSEmailQueueService();
    }
    return SQSEmailQueueService.instance;
  }

  /**
   * Check if SQS email queue is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Enqueue a welcome email
   */
  async enqueueWelcomeEmail(
    shop: string,
    recipient: { email: string; firstName?: string; lastName?: string },
    data: WelcomeEmailData
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return this.enqueue({
      emailType: "WELCOME",
      shop,
      recipient,
      data,
      eventType: "CUSTOMER_CREATED",
    });
  }

  /**
   * Enqueue a tier upgrade email
   */
  async enqueueTierUpgradeEmail(
    shop: string,
    recipient: { email: string; firstName?: string; lastName?: string },
    data: TierUpgradeEmailData
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return this.enqueue({
      emailType: "TIER_UPGRADE",
      shop,
      recipient,
      data,
      eventType: "TIER_UPGRADE",
    });
  }

  /**
   * Enqueue a points earned email
   */
  async enqueuePointsEarnedEmail(
    shop: string,
    recipient: { email: string; firstName?: string; lastName?: string },
    data: PointsEarnedEmailData
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return this.enqueue({
      emailType: "POINTS_EARNED",
      shop,
      recipient,
      data,
      eventType: "ORDER_PAID",
    });
  }

  /**
   * Enqueue a points expiring warning email
   */
  async enqueuePointsExpiringEmail(
    shop: string,
    recipient: { email: string; firstName?: string; lastName?: string },
    data: PointsExpiringEmailData
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return this.enqueue({
      emailType: "POINTS_EXPIRING",
      shop,
      recipient,
      data,
      eventType: "POINTS_EXPIRING",
    });
  }

  /**
   * Enqueue a points redeemed email with discount code
   */
  async enqueuePointsRedeemedEmail(
    shop: string,
    recipient: { email: string; firstName?: string; lastName?: string },
    data: PointsRedeemedEmailData
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return this.enqueue({
      emailType: "POINTS_REDEEMED",
      shop,
      recipient,
      data,
      eventType: "POINTS_REDEEMED",
    });
  }

  /**
   * Core enqueue method
   */
  private async enqueue(params: {
    emailType: EmailType;
    shop: string;
    recipient: { email: string; firstName?: string; lastName?: string };
    data: Record<string, any>;
    eventType?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { emailType, shop, recipient, data, eventType } = params;

    // Skip if no email address
    if (!recipient.email) {
      console.log(`[SQS Email] No email address, skipping ${emailType}`);
      return { success: true, messageId: "skipped-no-email" };
    }

    // Build message
    const message: EmailQueueMessage = {
      id: uuidv4(),
      emailType,
      shop,
      recipient,
      data,
      createdAt: new Date().toISOString(),
      metadata: {
        traceId: uuidv4(),
        source: "app",
      },
      eventType,
    };

    // If not enabled, fall back to sync processing
    if (!this.enabled) {
      console.log(`[SQS Email] Queue disabled, falling back to sync for ${emailType}`);
      return this.fallbackToSync(message);
    }

    try {
      const client = getSQSClient();
      const command = new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(message),
        MessageAttributes: {
          emailType: {
            DataType: "String",
            StringValue: emailType,
          },
          shop: {
            DataType: "String",
            StringValue: shop,
          },
          ...(eventType && {
            eventType: {
              DataType: "String",
              StringValue: eventType,
            },
          }),
        },
      });

      const response = await client.send(command);

      console.log(
        `[SQS Email] Enqueued ${emailType} for ${recipient.email} (MessageId: ${response.MessageId})`
      );

      return {
        success: true,
        messageId: response.MessageId,
      };
    } catch (error: any) {
      console.error(`[SQS Email] Failed to enqueue ${emailType}:`, error);

      // Fall back to sync processing on SQS failure
      return this.fallbackToSync(message);
    }
  }

  /**
   * Fallback to synchronous email sending
   */
  private async fallbackToSync(
    message: EmailQueueMessage
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Import email notifications service dynamically to avoid circular deps
      const emailNotifications = await import("./email-notifications.server");

      switch (message.emailType) {
        case "WELCOME":
          await emailNotifications.sendWelcomeEmailNotification(
            message.shop,
            {
              id: message.id,
              email: message.recipient.email,
              firstName: message.recipient.firstName || null,
              lastName: message.recipient.lastName || null,
              shop: message.shop,
            },
            {
              id: message.id,
              name: message.data.tierName || "Member",
              cashbackPercent: message.data.cashbackPercent || 0,
            }
          );
          break;

        case "TIER_UPGRADE":
          await emailNotifications.sendTierUpgradeEmailNotification(
            message.shop,
            {
              id: message.id,
              email: message.recipient.email,
              firstName: message.recipient.firstName || null,
              lastName: message.recipient.lastName || null,
              shop: message.shop,
            },
            message.data.previousTier
              ? { id: "", name: message.data.previousTier, cashbackPercent: 0 }
              : null,
            {
              id: "",
              name: message.data.newTier,
              cashbackPercent: message.data.newCashbackPercent,
            }
          );
          break;

        case "POINTS_EARNED":
          await emailNotifications.sendPointsEarnedEmail(message.shop, {
            customerId: message.id,
            email: message.recipient.email,
            firstName: message.recipient.firstName || null,
            pointsEarned: message.data.pointsEarned,
            totalBalance: message.data.totalBalance,
            orderNumber: message.data.orderNumber,
            tierMultiplier: message.data.tierMultiplier,
            bonusEvents: message.data.bonusEvents,
            currencyName: message.data.currencyName,
            currencyIcon: message.data.currencyIcon,
          });
          break;

        case "POINTS_EXPIRING":
          await emailNotifications.sendPointsExpiringEmail(message.shop, {
            customerId: message.id,
            email: message.recipient.email,
            firstName: message.recipient.firstName || null,
            pointsExpiring: message.data.pointsExpiring,
            daysUntilExpiry: message.data.daysUntilExpiry,
            currencyName: message.data.currencyName,
            currencyIcon: message.data.currencyIcon,
          });
          break;

        case "POINTS_REDEEMED":
          await emailNotifications.sendPointsRedeemedEmail(message.shop, {
            customerId: message.id,
            email: message.recipient.email,
            firstName: message.recipient.firstName || null,
            pointsSpent: message.data.pointsSpent,
            remainingBalance: message.data.remainingBalance,
            discountCode: message.data.discountCode,
            discountValue: message.data.discountValue,
            discountType: message.data.discountType,
            expiresAt: new Date(message.data.expiresAt),
            currencyName: message.data.currencyName,
            currencyIcon: message.data.currencyIcon,
          });
          break;

        default:
          console.log(`[SQS Email] Unknown email type: ${message.emailType}`);
      }

      return { success: true, messageId: `sync-${message.id}` };
    } catch (error: any) {
      console.error(`[SQS Email] Sync fallback failed:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<EmailQueueStats | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const client = getSQSClient();

      const command = new GetQueueAttributesCommand({
        QueueUrl: this.queueUrl,
        AttributeNames: [
          "ApproximateNumberOfMessages",
          "ApproximateNumberOfMessagesNotVisible",
          "ApproximateNumberOfMessagesDelayed",
        ],
      });

      const response = await client.send(command);
      const attrs = response.Attributes || {};

      const stats: EmailQueueStats = {
        approximateNumberOfMessages: parseInt(
          attrs.ApproximateNumberOfMessages || "0",
          10
        ),
        approximateNumberOfMessagesNotVisible: parseInt(
          attrs.ApproximateNumberOfMessagesNotVisible || "0",
          10
        ),
        approximateNumberOfMessagesDelayed: parseInt(
          attrs.ApproximateNumberOfMessagesDelayed || "0",
          10
        ),
      };

      // Get DLQ stats if configured
      if (this.dlqUrl) {
        const dlqCommand = new GetQueueAttributesCommand({
          QueueUrl: this.dlqUrl,
          AttributeNames: ["ApproximateNumberOfMessages"],
        });

        const dlqResponse = await client.send(dlqCommand);
        stats.dlqMessages = parseInt(
          dlqResponse.Attributes?.ApproximateNumberOfMessages || "0",
          10
        );
      }

      return stats;
    } catch (error) {
      console.error("[SQS Email] Failed to get queue stats:", error);
      return null;
    }
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * Singleton instance export
 */
export const sqsEmailQueue = SQSEmailQueueService.getInstance();

/**
 * Helper function: Send welcome email via queue with fallback
 */
export async function sendWelcomeEmailAsync(
  shop: string,
  recipient: { email: string; firstName?: string; lastName?: string },
  data: WelcomeEmailData
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const queue = SQSEmailQueueService.getInstance();
  return queue.enqueueWelcomeEmail(shop, recipient, data);
}

/**
 * Helper function: Send tier upgrade email via queue with fallback
 */
export async function sendTierUpgradeEmailAsync(
  shop: string,
  recipient: { email: string; firstName?: string; lastName?: string },
  data: TierUpgradeEmailData
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const queue = SQSEmailQueueService.getInstance();
  return queue.enqueueTierUpgradeEmail(shop, recipient, data);
}

/**
 * Helper function: Send points earned email via queue with fallback
 */
export async function sendPointsEarnedEmailAsync(
  shop: string,
  recipient: { email: string; firstName?: string; lastName?: string },
  data: PointsEarnedEmailData
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const queue = SQSEmailQueueService.getInstance();
  return queue.enqueuePointsEarnedEmail(shop, recipient, data);
}

/**
 * Helper function: Send points expiring email via queue with fallback
 */
export async function sendPointsExpiringEmailAsync(
  shop: string,
  recipient: { email: string; firstName?: string; lastName?: string },
  data: PointsExpiringEmailData
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const queue = SQSEmailQueueService.getInstance();
  return queue.enqueuePointsExpiringEmail(shop, recipient, data);
}

/**
 * Helper function: Send points redeemed email via queue with fallback
 */
export async function sendPointsRedeemedEmailAsync(
  shop: string,
  recipient: { email: string; firstName?: string; lastName?: string },
  data: PointsRedeemedEmailData
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const queue = SQSEmailQueueService.getInstance();
  return queue.enqueuePointsRedeemedEmail(shop, recipient, data);
}

export default SQSEmailQueueService;
