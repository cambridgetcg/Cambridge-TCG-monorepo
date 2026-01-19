/**
 * SNS Event Publisher Service
 *
 * Production-grade event publishing using AWS SNS for fan-out pattern.
 * Enables multiple consumers (email, Klaviyo, analytics, etc.) to react
 * to the same event without coupling.
 *
 * Architecture:
 * ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐
 * │  Webhook    │───►│ SNS Topic   │───►│ Email Queue     │
 * │  Handler    │    │             │    ├─────────────────┤
 * └─────────────┘    │             │───►│ Klaviyo Queue   │
 *                    │             │    ├─────────────────┤
 *                    │             │───►│ Analytics       │
 *                    └─────────────┘    └─────────────────┘
 *
 * Topics:
 * - order-processed: Order completed/refunded events
 * - customer-updated: Customer profile changes
 * - tier-changed: Tier upgrades/downgrades
 * - points-earned: Points earning events
 */

import { PublishCommand, PublishBatchCommand } from "@aws-sdk/client-sns";
import { getSNSClient, getAWSConfig } from "~/utils/aws-clients.server";
import { v4 as uuidv4 } from "uuid";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Event types
 */
export type EventType =
  | "ORDER_PAID"
  | "ORDER_REFUNDED"
  | "CUSTOMER_CREATED"
  | "CUSTOMER_UPDATED"
  | "TIER_UPGRADE"
  | "TIER_DOWNGRADE"
  | "POINTS_EARNED"
  | "POINTS_REDEEMED"
  | "POINTS_EXPIRED"
  | "POINTS_ADJUSTED";

/**
 * Base event structure
 */
export interface BaseEvent {
  id: string;
  eventType: EventType;
  shop: string;
  timestamp: string;
  metadata?: {
    traceId?: string;
    source?: string;
    version?: string;
  };
}

/**
 * Order event data
 */
export interface OrderEvent extends BaseEvent {
  eventType: "ORDER_PAID" | "ORDER_REFUNDED";
  customer: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    shopifyCustomerId?: string;
  };
  order: {
    id: string;
    orderNumber: string;
    totalAmount: number;
    currency: string;
    itemsCount: number;
  };
  rewards?: {
    cashbackEarned: number;
    pointsEarned: number;
    tierName: string;
    cashbackPercent: number;
  };
}

/**
 * Customer event data
 */
export interface CustomerEvent extends BaseEvent {
  eventType: "CUSTOMER_CREATED" | "CUSTOMER_UPDATED";
  customer: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    shopifyCustomerId?: string;
    phone?: string | null;
    tags?: string[];
  };
  tier?: {
    id: string;
    name: string;
    cashbackPercent: number;
  };
  stats?: {
    lifetimeSpend: number;
    orderCount: number;
    cashbackBalance: number;
    pointsBalance: number;
  };
}

/**
 * Tier change event data
 */
export interface TierChangeEvent extends BaseEvent {
  eventType: "TIER_UPGRADE" | "TIER_DOWNGRADE";
  customer: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  };
  previousTier: {
    id: string;
    name: string;
    cashbackPercent: number;
  } | null;
  newTier: {
    id: string;
    name: string;
    cashbackPercent: number;
  };
  trigger: "order" | "manual" | "recalculation";
  stats?: {
    lifetimeSpend: number;
    spendToNextTier: number | null;
  };
}

/**
 * Points event data
 */
export interface PointsEvent extends BaseEvent {
  eventType: "POINTS_EARNED" | "POINTS_REDEEMED" | "POINTS_EXPIRED" | "POINTS_ADJUSTED";
  customer: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  };
  points: {
    amount: number;
    previousBalance: number;
    newBalance: number;
    reason: string;
  };
  order?: {
    id: string;
    orderNumber: string;
  };
  discount?: {
    code: string;
    value: number;
    type: "fixed" | "percentage" | "shipping";
    expiresAt: string;
  };
}

/**
 * Union type of all events
 */
export type RewardsEvent = OrderEvent | CustomerEvent | TierChangeEvent | PointsEvent;

/**
 * Publish result
 */
export interface PublishResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

/**
 * SNS Event Publisher Service
 */
export class SNSEventPublisherService {
  private static instance: SNSEventPublisherService | null = null;

  private orderProcessedTopicArn: string;
  private customerUpdatedTopicArn: string;
  private tierChangedTopicArn: string;
  private pointsEarnedTopicArn: string;
  private enabled: boolean;

  private constructor() {
    const config = getAWSConfig();
    this.orderProcessedTopicArn = config.sns.orderProcessedTopicArn;
    this.customerUpdatedTopicArn = config.sns.customerUpdatedTopicArn;
    this.tierChangedTopicArn = config.sns.tierChangedTopicArn;
    this.pointsEarnedTopicArn = config.sns.pointsEarnedTopicArn;
    this.enabled = config.sns.enabled && !!this.orderProcessedTopicArn;

    if (this.enabled) {
      console.log(`[SNS Events] Publisher initialized`);
    } else {
      console.log("[SNS Events] Publisher disabled or not configured");
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): SNSEventPublisherService {
    if (!SNSEventPublisherService.instance) {
      SNSEventPublisherService.instance = new SNSEventPublisherService();
    }
    return SNSEventPublisherService.instance;
  }

  /**
   * Check if SNS publishing is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Publish an order paid event
   */
  async publishOrderPaid(params: {
    shop: string;
    customer: OrderEvent["customer"];
    order: OrderEvent["order"];
    rewards?: OrderEvent["rewards"];
  }): Promise<PublishResult> {
    const event: OrderEvent = {
      id: uuidv4(),
      eventType: "ORDER_PAID",
      shop: params.shop,
      timestamp: new Date().toISOString(),
      customer: params.customer,
      order: params.order,
      rewards: params.rewards,
      metadata: {
        traceId: uuidv4(),
        source: "app",
        version: "1.0",
      },
    };

    return this.publish(this.orderProcessedTopicArn, event);
  }

  /**
   * Publish an order refunded event
   */
  async publishOrderRefunded(params: {
    shop: string;
    customer: OrderEvent["customer"];
    order: OrderEvent["order"];
    rewards?: OrderEvent["rewards"];
  }): Promise<PublishResult> {
    const event: OrderEvent = {
      id: uuidv4(),
      eventType: "ORDER_REFUNDED",
      shop: params.shop,
      timestamp: new Date().toISOString(),
      customer: params.customer,
      order: params.order,
      rewards: params.rewards,
      metadata: {
        traceId: uuidv4(),
        source: "app",
        version: "1.0",
      },
    };

    return this.publish(this.orderProcessedTopicArn, event);
  }

  /**
   * Publish a customer created event
   */
  async publishCustomerCreated(params: {
    shop: string;
    customer: CustomerEvent["customer"];
    tier?: CustomerEvent["tier"];
    stats?: CustomerEvent["stats"];
  }): Promise<PublishResult> {
    const event: CustomerEvent = {
      id: uuidv4(),
      eventType: "CUSTOMER_CREATED",
      shop: params.shop,
      timestamp: new Date().toISOString(),
      customer: params.customer,
      tier: params.tier,
      stats: params.stats,
      metadata: {
        traceId: uuidv4(),
        source: "app",
        version: "1.0",
      },
    };

    return this.publish(this.customerUpdatedTopicArn, event);
  }

  /**
   * Publish a customer updated event
   */
  async publishCustomerUpdated(params: {
    shop: string;
    customer: CustomerEvent["customer"];
    tier?: CustomerEvent["tier"];
    stats?: CustomerEvent["stats"];
  }): Promise<PublishResult> {
    const event: CustomerEvent = {
      id: uuidv4(),
      eventType: "CUSTOMER_UPDATED",
      shop: params.shop,
      timestamp: new Date().toISOString(),
      customer: params.customer,
      tier: params.tier,
      stats: params.stats,
      metadata: {
        traceId: uuidv4(),
        source: "app",
        version: "1.0",
      },
    };

    return this.publish(this.customerUpdatedTopicArn, event);
  }

  /**
   * Publish a tier upgrade event
   */
  async publishTierUpgrade(params: {
    shop: string;
    customer: TierChangeEvent["customer"];
    previousTier: TierChangeEvent["previousTier"];
    newTier: TierChangeEvent["newTier"];
    trigger: TierChangeEvent["trigger"];
    stats?: TierChangeEvent["stats"];
  }): Promise<PublishResult> {
    const event: TierChangeEvent = {
      id: uuidv4(),
      eventType: "TIER_UPGRADE",
      shop: params.shop,
      timestamp: new Date().toISOString(),
      customer: params.customer,
      previousTier: params.previousTier,
      newTier: params.newTier,
      trigger: params.trigger,
      stats: params.stats,
      metadata: {
        traceId: uuidv4(),
        source: "app",
        version: "1.0",
      },
    };

    return this.publish(this.tierChangedTopicArn, event);
  }

  /**
   * Publish a tier downgrade event
   */
  async publishTierDowngrade(params: {
    shop: string;
    customer: TierChangeEvent["customer"];
    previousTier: TierChangeEvent["previousTier"];
    newTier: TierChangeEvent["newTier"];
    trigger: TierChangeEvent["trigger"];
    stats?: TierChangeEvent["stats"];
  }): Promise<PublishResult> {
    const event: TierChangeEvent = {
      id: uuidv4(),
      eventType: "TIER_DOWNGRADE",
      shop: params.shop,
      timestamp: new Date().toISOString(),
      customer: params.customer,
      previousTier: params.previousTier,
      newTier: params.newTier,
      trigger: params.trigger,
      stats: params.stats,
      metadata: {
        traceId: uuidv4(),
        source: "app",
        version: "1.0",
      },
    };

    return this.publish(this.tierChangedTopicArn, event);
  }

  /**
   * Publish a points earned event
   */
  async publishPointsEarned(params: {
    shop: string;
    customer: PointsEvent["customer"];
    points: PointsEvent["points"];
    order?: PointsEvent["order"];
  }): Promise<PublishResult> {
    const event: PointsEvent = {
      id: uuidv4(),
      eventType: "POINTS_EARNED",
      shop: params.shop,
      timestamp: new Date().toISOString(),
      customer: params.customer,
      points: params.points,
      order: params.order,
      metadata: {
        traceId: uuidv4(),
        source: "app",
        version: "1.0",
      },
    };

    return this.publish(this.pointsEarnedTopicArn, event);
  }

  /**
   * Publish a points redeemed event
   */
  async publishPointsRedeemed(params: {
    shop: string;
    customer: PointsEvent["customer"];
    points: PointsEvent["points"];
    discount: NonNullable<PointsEvent["discount"]>;
  }): Promise<PublishResult> {
    const event: PointsEvent = {
      id: uuidv4(),
      eventType: "POINTS_REDEEMED",
      shop: params.shop,
      timestamp: new Date().toISOString(),
      customer: params.customer,
      points: params.points,
      discount: params.discount,
      metadata: {
        traceId: uuidv4(),
        source: "app",
        version: "1.0",
      },
    };

    return this.publish(this.pointsEarnedTopicArn, event);
  }

  /**
   * Core publish method
   */
  private async publish(topicArn: string, event: RewardsEvent): Promise<PublishResult> {
    // If not enabled, log and skip
    if (!this.enabled) {
      console.log(`[SNS Events] Disabled, skipping ${event.eventType} for shop ${event.shop}`);
      return { success: true, messageId: "sns-disabled" };
    }

    if (!topicArn) {
      console.log(`[SNS Events] Topic ARN not configured for ${event.eventType}`);
      return { success: true, messageId: "topic-not-configured" };
    }

    try {
      const client = getSNSClient();
      const command = new PublishCommand({
        TopicArn: topicArn,
        Message: JSON.stringify(event),
        MessageAttributes: {
          eventType: {
            DataType: "String",
            StringValue: event.eventType,
          },
          shop: {
            DataType: "String",
            StringValue: event.shop,
          },
        },
      });

      const response = await client.send(command);

      console.log(
        `[SNS Events] Published ${event.eventType} for shop ${event.shop} (MessageId: ${response.MessageId})`
      );

      return {
        success: true,
        messageId: response.MessageId,
      };
    } catch (error: any) {
      console.error(`[SNS Events] Failed to publish ${event.eventType}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Publish multiple events in batch (up to 10)
   */
  async publishBatch(
    topicArn: string,
    events: RewardsEvent[]
  ): Promise<{ successful: number; failed: number; errors: string[] }> {
    if (!this.enabled || !topicArn) {
      return { successful: events.length, failed: 0, errors: [] };
    }

    // SNS batch supports max 10 messages
    const batches: RewardsEvent[][] = [];
    for (let i = 0; i < events.length; i += 10) {
      batches.push(events.slice(i, i + 10));
    }

    let successful = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const batch of batches) {
      try {
        const client = getSNSClient();
        const command = new PublishBatchCommand({
          TopicArn: topicArn,
          PublishBatchRequestEntries: batch.map((event, index) => ({
            Id: `${index}-${event.id}`,
            Message: JSON.stringify(event),
            MessageAttributes: {
              eventType: {
                DataType: "String",
                StringValue: event.eventType,
              },
              shop: {
                DataType: "String",
                StringValue: event.shop,
              },
            },
          })),
        });

        const response = await client.send(command);
        successful += response.Successful?.length || 0;

        if (response.Failed && response.Failed.length > 0) {
          failed += response.Failed.length;
          response.Failed.forEach((f) => {
            errors.push(`${f.Id}: ${f.Message}`);
          });
        }
      } catch (error: any) {
        failed += batch.length;
        errors.push(error.message);
      }
    }

    console.log(
      `[SNS Events] Batch publish: ${successful} successful, ${failed} failed`
    );

    return { successful, failed, errors };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * Singleton instance export
 */
export const snsEventPublisher = SNSEventPublisherService.getInstance();

/**
 * Helper: Publish order processed event
 */
export async function publishOrderProcessed(params: {
  shop: string;
  customer: OrderEvent["customer"];
  order: OrderEvent["order"];
  rewards?: OrderEvent["rewards"];
  isRefund?: boolean;
}): Promise<PublishResult> {
  const publisher = SNSEventPublisherService.getInstance();
  if (params.isRefund) {
    return publisher.publishOrderRefunded(params);
  }
  return publisher.publishOrderPaid(params);
}

/**
 * Helper: Publish customer event
 */
export async function publishCustomerEvent(params: {
  shop: string;
  customer: CustomerEvent["customer"];
  tier?: CustomerEvent["tier"];
  stats?: CustomerEvent["stats"];
  isNew?: boolean;
}): Promise<PublishResult> {
  const publisher = SNSEventPublisherService.getInstance();
  if (params.isNew) {
    return publisher.publishCustomerCreated(params);
  }
  return publisher.publishCustomerUpdated(params);
}

/**
 * Helper: Publish tier change event
 */
export async function publishTierChange(params: {
  shop: string;
  customer: TierChangeEvent["customer"];
  previousTier: TierChangeEvent["previousTier"];
  newTier: TierChangeEvent["newTier"];
  trigger: TierChangeEvent["trigger"];
  stats?: TierChangeEvent["stats"];
}): Promise<PublishResult> {
  const publisher = SNSEventPublisherService.getInstance();

  // Determine if upgrade or downgrade
  const previousPercent = params.previousTier?.cashbackPercent || 0;
  const newPercent = params.newTier.cashbackPercent;

  if (newPercent >= previousPercent) {
    return publisher.publishTierUpgrade(params);
  }
  return publisher.publishTierDowngrade(params);
}

/**
 * Helper: Publish points event
 */
export async function publishPointsEvent(params: {
  shop: string;
  customer: PointsEvent["customer"];
  points: PointsEvent["points"];
  order?: PointsEvent["order"];
  discount?: PointsEvent["discount"];
  eventType: "earned" | "redeemed" | "expired" | "adjusted";
}): Promise<PublishResult> {
  const publisher = SNSEventPublisherService.getInstance();

  switch (params.eventType) {
    case "earned":
      return publisher.publishPointsEarned({
        shop: params.shop,
        customer: params.customer,
        points: params.points,
        order: params.order,
      });
    case "redeemed":
      if (!params.discount) {
        return { success: false, error: "Discount info required for redemption event" };
      }
      return publisher.publishPointsRedeemed({
        shop: params.shop,
        customer: params.customer,
        points: params.points,
        discount: params.discount,
      });
    default:
      // For expired/adjusted, use points earned topic with appropriate event type
      return publisher.publishPointsEarned({
        shop: params.shop,
        customer: params.customer,
        points: params.points,
      });
  }
}

export default SNSEventPublisherService;
