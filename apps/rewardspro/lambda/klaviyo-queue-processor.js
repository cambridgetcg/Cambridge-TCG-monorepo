/**
 * AWS Lambda Function: Klaviyo Queue Processor
 *
 * Processes Klaviyo sync events asynchronously from SQS queue.
 * Handles profile syncing and event tracking to Klaviyo.
 *
 * Features:
 * - Idempotency via message ID tracking (prevents duplicate syncs)
 * - Batch processing with partial failure reporting
 * - Automatic retry via SQS with DLQ fallback
 *
 * Message Format:
 * {
 *   "id": "unique-message-id",
 *   "eventType": "PROFILE_SYNC" | "ORDER_EVENT" | "TIER_EVENT" | "POINTS_EVENT",
 *   "shop": "shop-domain.myshopify.com",
 *   "customer": {
 *     "id": "customer-id",
 *     "email": "customer@example.com",
 *     "firstName": "John",
 *     "lastName": "Doe",
 *     ...
 *   },
 *   "data": { ... event-specific data ... }
 * }
 */

const {
  RDSDataClient,
  ExecuteStatementCommand,
} = require("@aws-sdk/client-rds-data");
const crypto = require("crypto");
const { createKlaviyoRateLimiter, withRateLimit } = require("./lib/rate-limiter");

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

// Rate limiters per shop (created lazily)
const rateLimiters = new Map();

function getKlaviyoRateLimiter(shop) {
  if (!rateLimiters.has(shop)) {
    rateLimiters.set(shop, createKlaviyoRateLimiter(shop));
  }
  return rateLimiters.get(shop);
}

const KLAVIYO_API_URL = 'https://a.klaviyo.com/api';

// Configuration from environment
const CONFIG = {
  klaviyoApiKey: process.env.KLAVIYO_API_KEY
};

/**
 * Main Lambda handler - processes batch of SQS messages
 */
exports.handler = async (event) => {
  console.log(`[Klaviyo Processor] Processing ${event.Records.length} messages`);

  if (!CONFIG.klaviyoApiKey) {
    console.warn('[Klaviyo Processor] No Klaviyo API key configured, skipping all messages');
    return { batchItemFailures: [] };
  }

  const batchItemFailures = [];

  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.body);
      const messageId = message.id || record.messageId;

      console.log(`[Klaviyo Processor] Processing event type: ${message.eventType} for ${message.customer?.email}`);

      // Idempotency check - prevent duplicate processing
      const idempotencyKey = `KLAVIYO-${messageId}`;
      const alreadyProcessed = await checkIdempotency(idempotencyKey);
      if (alreadyProcessed) {
        console.log(`[Klaviyo Processor] Message ${messageId} already processed, skipping`);
        continue;
      }

      await processKlaviyoMessage(message);

      // Mark as processed for idempotency
      await markProcessed(idempotencyKey, message.shop, `KLAVIYO_${message.eventType}`);

      console.log(`[Klaviyo Processor] Successfully processed ${message.eventType} for ${message.customer?.email}`);
    } catch (error) {
      console.error(`[Klaviyo Processor] Failed to process message:`, error);
      console.error(`[Klaviyo Processor] Message body:`, record.body);

      // Report this item as failed for retry
      batchItemFailures.push({
        itemIdentifier: record.messageId
      });
    }
  }

  return {
    batchItemFailures
  };
};

/**
 * Process a single Klaviyo message based on type
 */
async function processKlaviyoMessage(message) {
  const { eventType, shop, customer, data } = message;

  if (!customer?.email) {
    console.log(`[Klaviyo Processor] Skipping - no customer email`);
    return;
  }

  switch (eventType) {
    case 'PROFILE_SYNC':
      await syncProfile(shop, customer, data);
      break;

    case 'ORDER_EVENT':
      await trackOrderEvent(shop, customer, data);
      break;

    case 'TIER_EVENT':
      await trackTierEvent(shop, customer, data);
      break;

    case 'POINTS_EVENT':
      await trackPointsEvent(shop, customer, data);
      break;

    case 'CUSTOMER_CREATED':
      await trackCustomerCreated(shop, customer, data);
      break;

    case 'CUSTOMER_UPDATED':
      await syncProfile(shop, customer, data);
      break;

    default:
      console.log(`[Klaviyo Processor] Unknown event type: ${eventType}`);
  }
}

/**
 * Sync customer profile to Klaviyo
 */
async function syncProfile(shop, customer, data = {}) {
  const profileData = {
    data: {
      type: 'profile',
      attributes: {
        email: customer.email,
        first_name: customer.firstName || undefined,
        last_name: customer.lastName || undefined,
        phone_number: customer.phone || undefined,
        properties: {
          // RewardsPro properties
          rewardspro_shop: shop,
          rewardspro_customer_id: customer.id,
          rewardspro_tier: data.tierName || customer.tierName || null,
          rewardspro_cashback_balance: data.cashbackBalance || customer.cashbackBalance || 0,
          rewardspro_lifetime_spend: data.lifetimeSpend || customer.lifetimeSpend || 0,
          rewardspro_order_count: data.orderCount || customer.orderCount || 0,
          rewardspro_points_balance: data.pointsBalance || 0,
          rewardspro_tier_progress: data.tierProgress || null,
          rewardspro_last_order_date: customer.lastOrderAt || null,
          rewardspro_member_since: customer.createdAt || null,
          // Shopify properties
          shopify_customer_id: customer.shopifyCustomerId || null,
          shopify_tags: customer.tags || null
        }
      }
    }
  };

  await klaviyoRequest('POST', '/profiles/', profileData, shop);
}

/**
 * Track order event
 */
async function trackOrderEvent(shop, customer, data) {
  // First ensure profile exists
  await syncProfile(shop, customer, data);

  const eventName = data.orderStatus === 'PAID'
    ? 'RewardsPro Order Completed'
    : data.orderStatus === 'REFUNDED'
    ? 'RewardsPro Order Refunded'
    : 'RewardsPro Order Event';

  const eventData = {
    data: {
      type: 'event',
      attributes: {
        profile: { email: customer.email },
        metric: { name: eventName },
        properties: {
          shop: shop,
          order_id: data.orderId,
          order_number: data.orderNumber,
          order_total: data.orderTotal,
          cashback_earned: data.cashbackEarned || 0,
          points_earned: data.pointsEarned || 0,
          tier_at_time: data.tierName || null,
          cashback_percent: data.cashbackPercent || 0,
          items_count: data.itemsCount || 0,
          currency: data.currency || 'USD'
        },
        value: data.orderTotal || 0,
        time: new Date().toISOString()
      }
    }
  };

  await klaviyoRequest('POST', '/events/', eventData, shop);
}

/**
 * Track tier change event
 */
async function trackTierEvent(shop, customer, data) {
  // Update profile with new tier
  await syncProfile(shop, customer, {
    ...data,
    tierName: data.newTier
  });

  const eventName = data.changeType === 'UPGRADE'
    ? 'RewardsPro Tier Upgrade'
    : 'RewardsPro Tier Change';

  const eventData = {
    data: {
      type: 'event',
      attributes: {
        profile: { email: customer.email },
        metric: { name: eventName },
        properties: {
          shop: shop,
          previous_tier: data.previousTier || null,
          new_tier: data.newTier,
          new_cashback_percent: data.newCashbackPercent || 0,
          lifetime_spend: data.lifetimeSpend || 0,
          spend_to_next_tier: data.spendToNextTier || null
        },
        time: new Date().toISOString()
      }
    }
  };

  await klaviyoRequest('POST', '/events/', eventData, shop);
}

/**
 * Track points/cashback event
 */
async function trackPointsEvent(shop, customer, data) {
  // Update profile with new balance
  await syncProfile(shop, customer, data);

  let eventName;
  switch (data.action) {
    case 'EARNED':
      eventName = 'RewardsPro Points Earned';
      break;
    case 'REDEEMED':
      eventName = 'RewardsPro Points Redeemed';
      break;
    case 'EXPIRED':
      eventName = 'RewardsPro Points Expired';
      break;
    case 'ADJUSTED':
      eventName = 'RewardsPro Points Adjusted';
      break;
    default:
      eventName = 'RewardsPro Points Event';
  }

  const eventData = {
    data: {
      type: 'event',
      attributes: {
        profile: { email: customer.email },
        metric: { name: eventName },
        properties: {
          shop: shop,
          points_amount: data.pointsAmount || 0,
          previous_balance: data.previousBalance || 0,
          new_balance: data.newBalance || 0,
          reason: data.reason || null,
          order_id: data.orderId || null
        },
        value: Math.abs(data.pointsAmount || 0),
        time: new Date().toISOString()
      }
    }
  };

  await klaviyoRequest('POST', '/events/', eventData, shop);
}

/**
 * Track customer created event
 */
async function trackCustomerCreated(shop, customer, data) {
  // Ensure profile exists
  await syncProfile(shop, customer, data);

  const eventData = {
    data: {
      type: 'event',
      attributes: {
        profile: { email: customer.email },
        metric: { name: 'RewardsPro Customer Created' },
        properties: {
          shop: shop,
          customer_id: customer.id,
          shopify_customer_id: customer.shopifyCustomerId,
          initial_tier: data.tierName || null,
          source: data.source || 'shopify'
        },
        time: new Date().toISOString()
      }
    }
  };

  await klaviyoRequest('POST', '/events/', eventData, shop);
}

/**
 * Make request to Klaviyo API with rate limiting
 */
async function klaviyoRequest(method, endpoint, body = null, shop = 'global') {
  const url = `${KLAVIYO_API_URL}${endpoint}`;
  const rateLimiter = getKlaviyoRateLimiter(shop);

  const options = {
    method,
    headers: {
      'Authorization': `Klaviyo-API-Key ${CONFIG.klaviyoApiKey}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'revision': '2024-02-15' // Klaviyo API revision
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  // Use rate limiter to prevent hitting Klaviyo limits
  const response = await withRateLimit(
    rateLimiter,
    async () => fetch(url, options),
    { cost: 1, maxRetries: 3, maxWaitMs: 30000 }
  );

  if (!response.ok) {
    const errorText = await response.text();

    // Handle duplicate profile (not an error)
    if (response.status === 409) {
      console.log(`[Klaviyo Processor] Profile already exists, updating instead`);
      return { duplicate: true };
    }

    throw new Error(`Klaviyo API error: ${response.status} - ${errorText}`);
  }

  // Some endpoints return empty response
  const text = await response.text();
  return text ? JSON.parse(text) : { success: true };
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
    console.error(`[Klaviyo Processor] Idempotency check failed:`, error);
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
    console.error(`[Klaviyo Processor] Failed to mark as processed:`, error);
    // Don't throw - the event was synced successfully
  }
}

// Export for testing
module.exports = {
  handler: exports.handler,
  processKlaviyoMessage,
  syncProfile,
  trackOrderEvent,
  trackTierEvent,
  trackPointsEvent,
  checkIdempotency,
  markProcessed
};
