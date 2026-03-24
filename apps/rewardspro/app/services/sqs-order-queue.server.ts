/**
 * SQS Order Queue Service
 * Production-grade order processing using AWS SQS
 *
 * Features:
 * - Standard queue for order processing
 * - Dead Letter Queue (DLQ) for failed messages
 * - Visibility timeout management
 * - Message deduplication using content-based deduplication
 * - Automatic retries with exponential backoff (handled by SQS)
 * - Graceful fallback to in-memory queue when SQS is unavailable
 *
 * Architecture:
 * ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐
 * │  Webhook    │───►│ SQS Queue   │───►│ Lambda Consumer │
 * │  Handler    │    │             │    │ (or Vercel)     │
 * └─────────────┘    └──────┬──────┘    └─────────────────┘
 *                           │ (4 failures)
 *                    ┌──────▼──────┐
 *                    │   DLQ       │
 *                    │ (manual     │
 *                    │  review)    │
 *                    └─────────────┘
 */

import {
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
  GetQueueAttributesCommand,
  type Message,
} from "@aws-sdk/client-sqs";
import { getSQSClient, getAWSConfig } from "~/utils/aws-clients.server";
import { v4 as uuidv4 } from "uuid";
import prisma from "~/db.server";

/**
 * Order queue message structure
 */
export interface SQSOrderMessage {
  id: string;
  webhookId?: string;
  shop: string;
  topic: string;
  payload: any;
  createdAt: string;
  source: "webhook" | "manual" | "retry";
  metadata?: {
    attemptNumber?: number;
    originalMessageId?: string;
    traceId?: string;
  };
}

/**
 * Queue statistics
 */
export interface SQSQueueStats {
  approximateNumberOfMessages: number;
  approximateNumberOfMessagesNotVisible: number;
  approximateNumberOfMessagesDelayed: number;
  dlqMessages?: number;
}

/**
 * SQS Order Queue Service
 */
export class SQSOrderQueueService {
  private static instance: SQSOrderQueueService | null = null;

  private queueUrl: string;
  private dlqUrl: string;
  private enabled: boolean;

  private constructor() {
    const config = getAWSConfig();
    this.queueUrl = config.sqs.orderQueueUrl;
    this.dlqUrl = config.sqs.dlqUrl;
    this.enabled = config.sqs.enabled && !!this.queueUrl;

    if (this.enabled) {
      console.log(`[SQS] Order queue initialized: ${this.queueUrl}`);
    } else {
      console.log("[SQS] Order queue disabled or not configured");
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): SQSOrderQueueService {
    if (!SQSOrderQueueService.instance) {
      SQSOrderQueueService.instance = new SQSOrderQueueService();
    }
    return SQSOrderQueueService.instance;
  }

  /**
   * Check if SQS is enabled and configured
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Enqueue an order for processing
   *
   * @param params Order message parameters
   * @returns Message ID if successful
   */
  async enqueue(params: {
    webhookId?: string;
    shop: string;
    topic: string;
    payload: any;
    delaySeconds?: number;
  }): Promise<{ messageId: string; success: boolean }> {
    const { webhookId, shop, topic, payload, delaySeconds = 0 } = params;

    // Check for duplicate webhooks (idempotency)
    if (webhookId) {
      const existing = await this.checkDuplicateWebhook(webhookId);
      if (existing) {
        console.log(`[SQS] Webhook ${webhookId} already processed, skipping`);
        return { messageId: existing.id, success: true };
      }
    }

    // Build message
    const message: SQSOrderMessage = {
      id: uuidv4(),
      webhookId,
      shop,
      topic,
      payload,
      createdAt: new Date().toISOString(),
      source: webhookId ? "webhook" : "manual",
      metadata: {
        traceId: uuidv4(),
      },
    };

    // Generate deduplication ID based on content
    const deduplicationId = webhookId || this.generateDeduplicationId(message);

    try {
      const client = getSQSClient();
      const command = new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(message),
        DelaySeconds: Math.min(delaySeconds, 900), // Max 15 minutes
        MessageAttributes: {
          shop: {
            DataType: "String",
            StringValue: shop,
          },
          topic: {
            DataType: "String",
            StringValue: topic,
          },
          source: {
            DataType: "String",
            StringValue: message.source,
          },
        },
        // For FIFO queues (if using), uncomment:
        // MessageGroupId: shop, // Group by shop for ordered processing
        // MessageDeduplicationId: deduplicationId,
      });

      const response = await client.send(command);

      console.log(
        `[SQS] Enqueued ${topic} for shop ${shop} (MessageId: ${response.MessageId})`
      );

      return {
        messageId: response.MessageId || message.id,
        success: true,
      };
    } catch (error: any) {
      console.error(`[SQS] Failed to enqueue ${topic} for shop ${shop}:`, error);

      // Don't throw - let caller decide on fallback
      return {
        messageId: "",
        success: false,
      };
    }
  }

  /**
   * Receive messages from the queue (for polling consumers)
   *
   * @param maxMessages Maximum messages to receive (1-10)
   * @param visibilityTimeout Seconds to hide message from other consumers
   * @param waitTimeSeconds Long polling wait time (0-20)
   */
  async receiveMessages(
    maxMessages: number = 10,
    visibilityTimeout: number = 300,
    waitTimeSeconds: number = 20
  ): Promise<SQSOrderMessage[]> {
    if (!this.enabled) {
      return [];
    }

    try {
      const client = getSQSClient();
      const command = new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: Math.min(maxMessages, 10),
        VisibilityTimeout: visibilityTimeout,
        WaitTimeSeconds: Math.min(waitTimeSeconds, 20),
        MessageAttributeNames: ["All"],
        AttributeNames: ["All"],
      });

      const response = await client.send(command);
      const messages = response.Messages || [];

      return messages.map((msg) => ({
        ...JSON.parse(msg.Body || "{}"),
        _sqsReceiptHandle: msg.ReceiptHandle,
        _sqsMessageId: msg.MessageId,
        _sqsApproximateReceiveCount: parseInt(
          msg.Attributes?.ApproximateReceiveCount || "1",
          10
        ),
      }));
    } catch (error) {
      console.error("[SQS] Failed to receive messages:", error);
      return [];
    }
  }

  /**
   * Delete a message after successful processing
   */
  async deleteMessage(receiptHandle: string): Promise<boolean> {
    if (!this.enabled || !receiptHandle) {
      return false;
    }

    try {
      const client = getSQSClient();
      const command = new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
      });

      await client.send(command);
      return true;
    } catch (error) {
      console.error("[SQS] Failed to delete message:", error);
      return false;
    }
  }

  /**
   * Extend visibility timeout for long-running processing
   */
  async extendVisibility(
    receiptHandle: string,
    additionalSeconds: number = 300
  ): Promise<boolean> {
    if (!this.enabled || !receiptHandle) {
      return false;
    }

    try {
      const client = getSQSClient();
      const command = new ChangeMessageVisibilityCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: additionalSeconds,
      });

      await client.send(command);
      console.log(
        `[SQS] Extended visibility timeout by ${additionalSeconds}s`
      );
      return true;
    } catch (error) {
      console.error("[SQS] Failed to extend visibility:", error);
      return false;
    }
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<SQSQueueStats | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const client = getSQSClient();

      // Get main queue stats
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

      const stats: SQSQueueStats = {
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
      console.error("[SQS] Failed to get queue stats:", error);
      return null;
    }
  }

  /**
   * Move a message to DLQ manually
   */
  async moveToDLQ(
    message: SQSOrderMessage,
    error: string
  ): Promise<boolean> {
    if (!this.enabled || !this.dlqUrl) {
      return false;
    }

    try {
      const client = getSQSClient();

      // Add error info to message
      const dlqMessage = {
        ...message,
        dlqInfo: {
          movedAt: new Date().toISOString(),
          error,
          reason: "manual",
        },
      };

      const command = new SendMessageCommand({
        QueueUrl: this.dlqUrl,
        MessageBody: JSON.stringify(dlqMessage),
        MessageAttributes: {
          shop: {
            DataType: "String",
            StringValue: message.shop,
          },
          topic: {
            DataType: "String",
            StringValue: message.topic,
          },
          error: {
            DataType: "String",
            StringValue: error.substring(0, 256), // Max attribute size
          },
        },
      });

      await client.send(command);
      console.log(`[SQS] Moved message ${message.id} to DLQ`);
      return true;
    } catch (dlqError) {
      console.error("[SQS] Failed to move message to DLQ:", dlqError);
      return false;
    }
  }

  /**
   * Receive messages from DLQ for review/reprocessing
   */
  async receiveDLQMessages(
    maxMessages: number = 10
  ): Promise<SQSOrderMessage[]> {
    if (!this.enabled || !this.dlqUrl) {
      return [];
    }

    try {
      const client = getSQSClient();
      const command = new ReceiveMessageCommand({
        QueueUrl: this.dlqUrl,
        MaxNumberOfMessages: Math.min(maxMessages, 10),
        VisibilityTimeout: 300,
        WaitTimeSeconds: 1, // Short poll for DLQ
        MessageAttributeNames: ["All"],
        AttributeNames: ["All"],
      });

      const response = await client.send(command);
      const messages = response.Messages || [];

      return messages.map((msg) => ({
        ...JSON.parse(msg.Body || "{}"),
        _sqsReceiptHandle: msg.ReceiptHandle,
        _sqsMessageId: msg.MessageId,
      }));
    } catch (error) {
      console.error("[SQS] Failed to receive DLQ messages:", error);
      return [];
    }
  }

  /**
   * Reprocess a DLQ message by moving it back to main queue
   */
  async reprocessDLQMessage(
    message: SQSOrderMessage & { _sqsReceiptHandle?: string }
  ): Promise<boolean> {
    if (!this.enabled || !message._sqsReceiptHandle) {
      return false;
    }

    try {
      // Send to main queue
      const result = await this.enqueue({
        webhookId: message.webhookId,
        shop: message.shop,
        topic: message.topic,
        payload: message.payload,
      });

      if (result.success) {
        // Delete from DLQ
        const client = getSQSClient();
        await client.send(
          new DeleteMessageCommand({
            QueueUrl: this.dlqUrl,
            ReceiptHandle: message._sqsReceiptHandle,
          })
        );
        console.log(`[SQS] Reprocessed DLQ message ${message.id}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error("[SQS] Failed to reprocess DLQ message:", error);
      return false;
    }
  }

  /**
   * Check if webhook was already processed (idempotency)
   */
  private async checkDuplicateWebhook(
    webhookId: string
  ): Promise<{ id: string } | null> {
    try {
      const existing = await prisma.webhookProcessed.findUnique({
        where: { webhookId },
        select: { id: true },
      });
      return existing;
    } catch {
      return null;
    }
  }

  /**
   * Generate deduplication ID from message content
   */
  private generateDeduplicationId(message: SQSOrderMessage): string {
    // Create deterministic ID from shop + topic + payload hash
    const content = `${message.shop}:${message.topic}:${JSON.stringify(message.payload)}`;
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `${message.shop}-${Math.abs(hash).toString(16)}`;
  }
}

/**
 * Convenience export for singleton instance
 */
export const sqsOrderQueue = SQSOrderQueueService.getInstance();

/**
 * Helper: Enqueue webhook with automatic fallback to in-memory queue
 */
export async function enqueueWebhookToSQS(
  request: Request,
  topic: string,
  payload: any
): Promise<Response> {
  const webhookId = request.headers.get("x-shopify-webhook-id") || undefined;
  const shop = request.headers.get("x-shopify-shop-domain") || "unknown";

  const queue = SQSOrderQueueService.getInstance();

  if (queue.isEnabled()) {
    const result = await queue.enqueue({
      webhookId,
      shop,
      topic,
      payload,
    });

    if (result.success) {
      return new Response("Accepted", { status: 202 });
    }
    // Fall through to fallback
  }

  // Fallback: Use in-memory queue
  const { OrderProcessingQueue } = await import("./order-queue.server");
  await OrderProcessingQueue.enqueue({
    webhookId,
    shop,
    topic,
    payload,
  });

  return new Response("Accepted", { status: 202 });
}

export default SQSOrderQueueService;
