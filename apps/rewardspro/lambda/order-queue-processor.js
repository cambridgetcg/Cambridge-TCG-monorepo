/**
 * AWS Lambda Function: SQS Order Queue Processor
 *
 * This Lambda function processes order webhooks from the SQS queue.
 * It handles batch processing with partial failure reporting.
 *
 * Trigger: SQS (rewardspro-order-queue)
 * Batch Size: 10 messages
 * Visibility Timeout: 300 seconds (5 minutes)
 *
 * Features:
 * - Batch processing for efficiency
 * - Partial failure reporting (batchItemFailures)
 * - Idempotency checking
 * - CloudWatch metrics
 * - Automatic retry via SQS (DLQ after 4 failures)
 */

const {
  RDSDataClient,
  ExecuteStatementCommand,
} = require("@aws-sdk/client-rds-data");
const crypto = require("crypto");

// Initialize RDS Data API client
const rdsClient = new RDSDataClient({
  region: process.env.AWS_REGION || "eu-north-1",
});

// Database configuration
const DB_CONFIG = {
  resourceArn: process.env.AURORA_RESOURCE_ARN,
  secretArn: process.env.AURORA_SECRET_ARN,
  database: process.env.AURORA_DATABASE_NAME || "rewardspro",
};

// Vercel app URL for webhook processing
const VERCEL_APP_URL = process.env.VERCEL_APP_URL || "";
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "";

/**
 * Main Lambda handler for SQS events
 *
 * @param {Object} event - SQS event with Records array
 * @returns {Object} - Batch item failures for partial success
 */
exports.handler = async (event) => {
  console.log(
    `[OrderQueueProcessor] Processing ${event.Records.length} messages`
  );

  const batchItemFailures = [];
  const processedMessages = [];

  // Process each message
  for (const record of event.Records) {
    const messageId = record.messageId;

    try {
      // Parse message body
      const message = JSON.parse(record.body);
      console.log(
        `[OrderQueueProcessor] Processing message ${messageId}: ` +
          `${message.topic} for shop ${message.shop}`
      );

      // Check receive count for monitoring
      const receiveCount = parseInt(
        record.attributes?.ApproximateReceiveCount || "1",
        10
      );
      if (receiveCount > 1) {
        console.log(
          `[OrderQueueProcessor] Message ${messageId} retry attempt ${receiveCount}`
        );
      }

      // Check for duplicate processing (idempotency)
      if (message.webhookId) {
        const alreadyProcessed = await checkWebhookProcessed(message.webhookId);
        if (alreadyProcessed) {
          console.log(
            `[OrderQueueProcessor] Webhook ${message.webhookId} already processed, skipping`
          );
          processedMessages.push(messageId);
          continue;
        }
      }

      // Process based on topic
      await processOrderMessage(message);

      // Mark webhook as processed (for idempotency)
      if (message.webhookId) {
        await markWebhookProcessed(message);
      }

      processedMessages.push(messageId);
      console.log(
        `[OrderQueueProcessor] Successfully processed message ${messageId}`
      );
    } catch (error) {
      console.error(
        `[OrderQueueProcessor] Error processing message ${messageId}:`,
        error
      );

      // Add to failures for SQS to retry
      batchItemFailures.push({
        itemIdentifier: messageId,
      });
    }
  }

  console.log(
    `[OrderQueueProcessor] Completed: ${processedMessages.length} success, ` +
      `${batchItemFailures.length} failures`
  );

  // Return partial failures for SQS to retry those specific messages
  return {
    batchItemFailures,
  };
};

/**
 * Process an order message based on topic
 */
async function processOrderMessage(message) {
  const { topic, shop, payload } = message;

  switch (topic) {
    case "orders/paid":
      await processOrderPaid(shop, payload);
      break;
    case "orders/cancelled":
      await processOrderCancelled(shop, payload);
      break;
    case "orders/refunded":
      await processOrderRefunded(shop, payload);
      break;
    case "orders/create":
      await processOrderCreate(shop, payload);
      break;
    case "orders/updated":
      await processOrderUpdated(shop, payload);
      break;
    default:
      console.warn(`[OrderQueueProcessor] Unknown topic: ${topic}`);
  }
}

/**
 * Process orders/paid webhook
 * Main order processing - updates customer spending, tiers, cashback
 */
async function processOrderPaid(shop, payload) {
  const orderId = payload.id;
  const orderName = payload.name || payload.order_number;
  const customerData = payload.customer;

  console.log(
    `[OrderQueueProcessor] Processing order paid: ${orderName} for ${shop}`
  );

  // Extract order data
  const totalPrice = parseFloat(payload.total_price || "0");
  const subtotalPrice = parseFloat(payload.subtotal_price || "0");
  const currency = payload.currency || "USD";

  // Skip if no customer
  if (!customerData?.id) {
    console.log(`[OrderQueueProcessor] No customer for order ${orderName}`);
    return;
  }

  // Call Vercel API endpoint for complex processing
  // (This delegates to the existing Remix services)
  if (VERCEL_APP_URL && INTERNAL_API_SECRET) {
    await callVercelAPI("/api/internal/process-order", {
      shop,
      orderId: `gid://shopify/Order/${orderId}`,
      orderName,
      customerId: `gid://shopify/Customer/${customerData.id}`,
      totalPrice,
      subtotalPrice,
      currency,
      payload,
    });
  } else {
    // Direct database processing (simplified)
    await processOrderPaidDirect(shop, payload);
  }
}

/**
 * Direct database processing for order paid
 * Used when Vercel API is not configured
 */
async function processOrderPaidDirect(shop, payload) {
  const orderId = payload.id;
  const customerId = payload.customer?.id;

  if (!customerId) return;

  const totalPrice = parseFloat(payload.total_price || "0");
  const shopifyOrderId = `gid://shopify/Order/${orderId}`;
  const shopifyCustomerId = `gid://shopify/Customer/${customerId}`;

  // Upsert customer
  // CRITICAL: ON CONFLICT must match the unique constraint (shop, shopifyCustomerId)
  // to ensure proper multi-tenancy isolation
  await executeStatement(
    `
    INSERT INTO "Customer" (
      id, shop, "shopifyCustomerId", email, "firstName", "lastName",
      "totalSpent", "orderCount", "createdAt", "updatedAt"
    )
    VALUES (
      :id, :shop, :shopifyCustomerId, :email, :firstName, :lastName,
      :totalSpent, 1, NOW(), NOW()
    )
    ON CONFLICT (shop, "shopifyCustomerId") DO UPDATE SET
      "totalSpent" = "Customer"."totalSpent" + :totalSpent,
      "orderCount" = "Customer"."orderCount" + 1,
      "lastOrderDate" = NOW(),
      "updatedAt" = NOW()
    `,
    [
      { name: "id", value: { stringValue: crypto.randomUUID() } },
      { name: "shop", value: { stringValue: shop } },
      { name: "shopifyCustomerId", value: { stringValue: shopifyCustomerId } },
      {
        name: "email",
        value: { stringValue: payload.customer?.email || "" },
      },
      {
        name: "firstName",
        value: { stringValue: payload.customer?.first_name || "" },
      },
      {
        name: "lastName",
        value: { stringValue: payload.customer?.last_name || "" },
      },
      { name: "totalSpent", value: { doubleValue: totalPrice } },
    ]
  );

  // Create order record
  // CRITICAL: ON CONFLICT must match the unique constraint (shop, shopifyOrderId)
  // to ensure proper multi-tenancy isolation
  await executeStatement(
    `
    INSERT INTO "Order" (
      id, shop, "shopifyOrderId", "shopifyCustomerId",
      "orderNumber", total, status, "createdAt", "updatedAt"
    )
    VALUES (
      :id, :shop, :shopifyOrderId, :shopifyCustomerId,
      :orderNumber, :total, 'PAID', NOW(), NOW()
    )
    ON CONFLICT (shop, "shopifyOrderId") DO UPDATE SET
      status = 'PAID',
      "updatedAt" = NOW()
    `,
    [
      { name: "id", value: { stringValue: crypto.randomUUID() } },
      { name: "shop", value: { stringValue: shop } },
      { name: "shopifyOrderId", value: { stringValue: shopifyOrderId } },
      { name: "shopifyCustomerId", value: { stringValue: shopifyCustomerId } },
      {
        name: "orderNumber",
        value: { stringValue: payload.name || String(payload.order_number) },
      },
      { name: "total", value: { doubleValue: totalPrice } },
    ]
  );

  console.log(
    `[OrderQueueProcessor] Processed order ${payload.name} directly`
  );
}

/**
 * Process orders/cancelled webhook
 */
async function processOrderCancelled(shop, payload) {
  const orderName = payload.name || payload.order_number;
  console.log(
    `[OrderQueueProcessor] Processing order cancelled: ${orderName}`
  );

  if (VERCEL_APP_URL && INTERNAL_API_SECRET) {
    await callVercelAPI("/api/internal/cancel-order", {
      shop,
      orderId: `gid://shopify/Order/${payload.id}`,
      payload,
    });
  } else {
    // Direct update - CRITICAL: Always scope by shop for multi-tenancy isolation
    await executeStatement(
      `
      UPDATE "Order" SET status = 'CANCELLED', "updatedAt" = NOW()
      WHERE shop = :shop AND "shopifyOrderId" = :orderId
      `,
      [
        { name: "shop", value: { stringValue: shop } },
        {
          name: "orderId",
          value: { stringValue: `gid://shopify/Order/${payload.id}` },
        },
      ]
    );
  }
}

/**
 * Process orders/refunded webhook
 */
async function processOrderRefunded(shop, payload) {
  console.log(
    `[OrderQueueProcessor] Processing order refunded for shop ${shop}`
  );

  if (VERCEL_APP_URL && INTERNAL_API_SECRET) {
    await callVercelAPI("/api/internal/process-refund", {
      shop,
      orderId: `gid://shopify/Order/${payload.order_id || payload.id}`,
      payload,
    });
  }
}

/**
 * Process orders/create webhook
 */
async function processOrderCreate(shop, payload) {
  console.log(
    `[OrderQueueProcessor] Processing order create: ${payload.name}`
  );
  // Usually handled by orders/paid, but can log for tracking
}

/**
 * Process orders/updated webhook
 */
async function processOrderUpdated(shop, payload) {
  console.log(
    `[OrderQueueProcessor] Processing order update: ${payload.name}`
  );
  // Handle order modifications if needed
}

/**
 * Check if webhook was already processed
 */
async function checkWebhookProcessed(webhookId) {
  try {
    const result = await executeStatement(
      `SELECT id FROM "WebhookProcessed" WHERE "webhookId" = :webhookId LIMIT 1`,
      [{ name: "webhookId", value: { stringValue: webhookId } }]
    );
    return result.records && result.records.length > 0;
  } catch (error) {
    console.error("Error checking webhook processed:", error);
    return false;
  }
}

/**
 * Mark webhook as processed for idempotency
 */
async function markWebhookProcessed(message) {
  try {
    await executeStatement(
      `
      INSERT INTO "WebhookProcessed" (id, "webhookId", shop, topic, "processedAt")
      VALUES (:id, :webhookId, :shop, :topic, NOW())
      ON CONFLICT ("webhookId") DO NOTHING
      `,
      [
        { name: "id", value: { stringValue: crypto.randomUUID() } },
        { name: "webhookId", value: { stringValue: message.webhookId } },
        { name: "shop", value: { stringValue: message.shop } },
        { name: "topic", value: { stringValue: message.topic } },
      ]
    );
  } catch (error) {
    console.error("Error marking webhook processed:", error);
  }
}

/**
 * Call Vercel API for complex processing
 */
async function callVercelAPI(path, data) {
  const url = `${VERCEL_APP_URL}${path}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${INTERNAL_API_SECRET}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Vercel API error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  return response.json();
}

/**
 * Execute SQL statement using Aurora Data API
 */
async function executeStatement(sql, parameters) {
  const command = new ExecuteStatementCommand({
    ...DB_CONFIG,
    sql,
    parameters,
    includeResultMetadata: true,
  });

  return rdsClient.send(command);
}
