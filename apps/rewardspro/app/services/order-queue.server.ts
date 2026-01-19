/**
 * Order Processing Queue Service
 * Handles high-volume order processing with async queue
 * Implements best practices for scalability and reliability
 *
 * NOTE: This in-memory implementation is used as a fallback when SQS is not available.
 * For production, enable SQS by setting USE_SQS_QUEUE=true.
 * See: app/services/sqs-order-queue.server.ts
 */

import db from '../db.server';
import { v4 as uuidv4 } from 'uuid';
import { getAWSConfig } from '~/utils/aws-clients.server';

export interface OrderQueueItem {
  id: string;
  webhookId?: string;
  shop: string;
  topic: string;
  payload: any;
  attempts: number;
  maxAttempts: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'DEAD_LETTER';
  createdAt: Date;
  processedAt?: Date;
  nextRetryAt?: Date;
  error?: string;
}

/**
 * Simple in-memory queue for order processing
 * In production, consider using Redis Queue, Bull, or AWS SQS
 */
export class OrderProcessingQueue {
  private static queue: Map<string, OrderQueueItem> = new Map();
  private static processing = false;
  private static maxConcurrency = 5;
  private static retryDelays = [1000, 5000, 15000, 60000]; // Exponential backoff

  /**
   * Add an order webhook to the queue
   */
  static async enqueue(params: {
    webhookId?: string;
    shop: string;
    topic: string;
    payload: any;
  }): Promise<OrderQueueItem> {
    const { webhookId, shop, topic, payload } = params;

    // Check if webhook already processed (idempotency)
    if (webhookId) {
      const existing = await db.webhookProcessed.findUnique({
        where: {
          webhookId
        }
      });

      if (existing) {
        console.log(`[Queue] Webhook ${webhookId} already processed, skipping`);
        return {
          id: existing.id,
          webhookId,
          shop,
          topic,
          payload,
          attempts: 0,
          maxAttempts: 0,
          status: 'COMPLETED',
          createdAt: existing.processedAt,
          processedAt: existing.processedAt
        };
      }
    }

    // Create queue item
    const item: OrderQueueItem = {
      id: uuidv4(),
      webhookId,
      shop,
      topic,
      payload,
      attempts: 0,
      maxAttempts: 4,
      status: 'PENDING',
      createdAt: new Date()
    };

    // Add to queue
    this.queue.set(item.id, item);

    // Start processing if not already running
    if (!this.processing) {
      this.startProcessing();
    }

    console.log(`[Queue] Enqueued ${topic} for shop ${shop} (ID: ${item.id})`);
    return item;
  }

  /**
   * Start processing queue items
   */
  private static async startProcessing(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    console.log('[Queue] Starting queue processor');

    while (this.queue.size > 0) {
      // Get pending items
      const pendingItems = Array.from(this.queue.values())
        .filter(item =>
          item.status === 'PENDING' ||
          (item.status === 'FAILED' && item.nextRetryAt && item.nextRetryAt <= new Date())
        )
        .slice(0, this.maxConcurrency);

      if (pendingItems.length === 0) {
        // No items ready to process
        await this.sleep(1000);
        continue;
      }

      // Process items concurrently (up to max concurrency)
      await Promise.all(
        pendingItems.map(item => this.processItem(item))
      );
    }

    this.processing = false;
    console.log('[Queue] Queue processor stopped');
  }

  /**
   * Process a single queue item
   */
  private static async processItem(item: OrderQueueItem): Promise<void> {
    console.log(`[Queue] Processing ${item.topic} (ID: ${item.id})`);

    // Update status
    item.status = 'PROCESSING';
    item.attempts++;

    try {
      // Record webhook as processed (for idempotency, without payload to avoid timeout)
      if (item.webhookId) {
        await db.webhookProcessed.create({
          data: {
            id: uuidv4(),
            shop: item.shop,
            topic: item.topic,
            webhookId: item.webhookId,
            processedAt: new Date()
          }
        });
      }

      // Process based on topic
      switch (item.topic) {
        case 'orders/paid':
          await this.processOrderPaid(item);
          break;
        case 'orders/cancelled':
          await this.processOrderCancelled(item);
          break;
        case 'orders/refunded':
          await this.processOrderRefunded(item);
          break;
        default:
          console.warn(`[Queue] Unknown topic: ${item.topic}`);
      }

      // Mark as completed
      item.status = 'COMPLETED';
      item.processedAt = new Date();

      // Remove from queue after success
      this.queue.delete(item.id);

      console.log(`[Queue] Completed ${item.topic} (ID: ${item.id})`);

    } catch (error: any) {
      console.error(`[Queue] Error processing ${item.topic} (ID: ${item.id}):`, error);

      item.error = error.message;

      // Determine if we should retry
      if (item.attempts < item.maxAttempts) {
        // Schedule retry with exponential backoff
        const delayMs = this.retryDelays[Math.min(item.attempts - 1, this.retryDelays.length - 1)];
        item.status = 'FAILED';
        item.nextRetryAt = new Date(Date.now() + delayMs);

        console.log(`[Queue] Will retry ${item.topic} in ${delayMs}ms (attempt ${item.attempts}/${item.maxAttempts})`);
      } else {
        // Move to dead letter queue
        item.status = 'DEAD_LETTER';

        // Store in database for manual review
        await this.saveDeadLetter(item);

        // Remove from active queue
        this.queue.delete(item.id);

        console.error(`[Queue] Moved ${item.topic} to dead letter queue after ${item.attempts} attempts`);
      }
    }
  }

  /**
   * Process order paid webhook
   */
  private static async processOrderPaid(item: OrderQueueItem): Promise<void> {
    const order = item.payload;

    // Import the actual processing logic
    // This would be the logic from webhooks.orders.paid.tsx
    // For now, just log
    console.log(`[Queue] Processing order ${order.name} payment`);

    // In real implementation:
    // - Create/update customer
    // - Process tier products
    // - Calculate and award cashback
    // - Update spending totals
    // - Check tier progression
  }

  /**
   * Process order cancelled webhook
   */
  private static async processOrderCancelled(item: OrderQueueItem): Promise<void> {
    const order = item.payload;
    console.log(`[Queue] Processing order ${order.name} cancellation`);

    // Reverse any cashback or tier changes
  }

  /**
   * Process order refunded webhook
   */
  private static async processOrderRefunded(item: OrderQueueItem): Promise<void> {
    const refund = item.payload;
    console.log(`[Queue] Processing refund ${refund.id}`);

    // Claw back cashback, cancel memberships, etc.
  }

  /**
   * Save failed item to dead letter queue
   */
  private static async saveDeadLetter(item: OrderQueueItem): Promise<void> {
    try {
      await db.deadLetterQueue.create({
        data: {
          id: uuidv4(),
          webhookId: item.webhookId || null,
          shop: item.shop,
          topic: item.topic,
          payload: item.payload,
          attempts: item.attempts,
          error: item.error || 'Unknown error',
          createdAt: item.createdAt,
          failedAt: new Date()
        }
      });
      console.log(`[Queue] Saved ${item.topic} to dead letter queue (ID: ${item.id})`);
    } catch (error) {
      console.error('[Queue] Failed to save dead letter:', error);
    }
  }

  /**
   * Get queue statistics
   */
  static getStats(): {
    total: number;
    pending: number;
    processing: number;
    failed: number;
    completed: number;
    deadLetter: number;
  } {
    const items = Array.from(this.queue.values());

    return {
      total: items.length,
      pending: items.filter(i => i.status === 'PENDING').length,
      processing: items.filter(i => i.status === 'PROCESSING').length,
      failed: items.filter(i => i.status === 'FAILED').length,
      completed: items.filter(i => i.status === 'COMPLETED').length,
      deadLetter: items.filter(i => i.status === 'DEAD_LETTER').length
    };
  }

  /**
   * Clear completed items from queue
   */
  static clearCompleted(): number {
    let cleared = 0;
    for (const [id, item] of this.queue.entries()) {
      if (item.status === 'COMPLETED') {
        this.queue.delete(id);
        cleared++;
      }
    }
    return cleared;
  }

  /**
   * Retry dead letter items
   */
  static retryDeadLetter(itemId: string): boolean {
    const item = this.queue.get(itemId);
    if (item && item.status === 'DEAD_LETTER') {
      item.status = 'PENDING';
      item.attempts = 0;
      item.error = undefined;
      item.nextRetryAt = undefined;
      return true;
    }
    return false;
  }

  /**
   * Helper: Sleep for specified milliseconds
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Webhook handler wrapper that uses the queue
 * Use this in webhook routes for async processing
 *
 * Automatically uses SQS if enabled (USE_SQS_QUEUE=true),
 * falls back to in-memory queue otherwise.
 */
export async function enqueueWebhook(
  request: Request,
  topic: string,
  payload: any
): Promise<Response> {
  const webhookId = request.headers.get('x-shopify-webhook-id') || undefined;
  const shop = request.headers.get('x-shopify-shop-domain') || 'unknown';

  // Check if SQS is enabled
  const awsConfig = getAWSConfig();
  if (awsConfig.sqs.enabled) {
    try {
      const { SQSOrderQueueService } = await import('./sqs-order-queue.server');
      const sqsQueue = SQSOrderQueueService.getInstance();

      const result = await sqsQueue.enqueue({
        webhookId,
        shop,
        topic,
        payload,
      });

      if (result.success) {
        console.log(`[Queue] Enqueued via SQS: ${topic} for ${shop}`);
        return new Response('Accepted', { status: 202 });
      }

      // Fall through to in-memory if SQS failed
      console.warn(`[Queue] SQS failed, falling back to in-memory queue`);
    } catch (sqsError: any) {
      console.error(`[Queue] SQS error, using fallback:`, sqsError.message);
    }
  }

  // Fallback: Use in-memory queue
  try {
    await OrderProcessingQueue.enqueue({
      webhookId,
      shop,
      topic,
      payload
    });

    // Return immediately to Shopify
    return new Response('Accepted', { status: 202 });

  } catch (error: any) {
    console.error(`[Queue] Failed to enqueue ${topic}:`, error);
    // Still return success to prevent Shopify retries
    return new Response('Error but acknowledged', { status: 200 });
  }
}

export default OrderProcessingQueue;