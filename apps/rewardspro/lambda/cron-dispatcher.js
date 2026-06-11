/**
 * AWS Lambda Function: Cron Job Dispatcher
 *
 * This Lambda function is triggered by EventBridge scheduled rules
 * and dispatches cron jobs to the Vercel app.
 *
 * Features:
 * - EventBridge scheduled triggers
 * - Distributed lock acquisition via DynamoDB
 * - HTTP dispatch to Vercel cron endpoints
 * - Error handling with automatic retry
 * - CloudWatch metrics and logging
 *
 * EventBridge Rules:
 * - tier-maintenance: 0 2 * * * (daily at 2 AM UTC)
 * - tier-recalculation: 0 3 * * 0 (weekly Sunday at 3 AM)
 * - order-sync: rate(15 minutes)
 * - cache-warmup: rate(1 hour)
 * - etc.
 */

const {
  DynamoDBClient,
  PutItemCommand,
  DeleteItemCommand,
  GetItemCommand,
} = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");

// Initialize DynamoDB client for distributed locking
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "eu-north-1",
});

// Configuration
const LOCKS_TABLE = process.env.AWS_DYNAMODB_LOCKS_TABLE || "rewardspro-cron-locks";
const VERCEL_APP_URL = process.env.VERCEL_APP_URL || "";
const CRON_SECRET = process.env.CRON_SECRET || "";

/**
 * Cron job definitions with endpoints and lock TTL
 */
const CRON_JOBS = {
  "tier-maintenance": {
    endpoint: "/api/cron/tier-maintenance",
    ttlMinutes: 30,
    description: "Run tier maintenance tasks",
  },
  "tier-recalculation": {
    endpoint: "/api/cron/tier-recalculation",
    ttlMinutes: 60,
    description: "Recalculate customer tiers",
  },
  "webhook-cleanup": {
    endpoint: "/api/cron/webhook-cleanup",
    ttlMinutes: 15,
    description: "Clean up processed webhooks",
  },
  "order-sync": {
    endpoint: "/api/cron/order-sync",
    ttlMinutes: 20,
    description: "Sync orders from Shopify",
  },
  "cache-warmup": {
    endpoint: "/api/cron/cache-warmup",
    ttlMinutes: 10,
    description: "Warm up application caches",
  },
  "analytics-aggregation": {
    endpoint: "/api/cron/analytics-aggregation",
    ttlMinutes: 45,
    description: "Aggregate analytics data",
  },
  "email-digest": {
    endpoint: "/api/cron/email-digest",
    ttlMinutes: 60,
    description: "Send email digests",
  },
  "subscription-renewal": {
    endpoint: "/api/cron/subscription-renewal",
    ttlMinutes: 30,
    description: "Process subscription renewals",
  },
  "points-expiration": {
    endpoint: "/api/cron/points-expiration",
    ttlMinutes: 30,
    description: "Handle points expiration",
  },
  "credit-reconciliation": {
    endpoint: "/api/cron/credit-reconciliation",
    ttlMinutes: 45,
    description: "Reconcile store credits",
  },
  "dlq-processor": {
    endpoint: "/api/cron/dlq-processor",
    ttlMinutes: 15,
    description: "Process dead letter queue",
  },
  "health-check": {
    endpoint: "/api/cron/health-check",
    ttlMinutes: 5,
    description: "Health check and monitoring",
  },
};

/**
 * Main Lambda handler
 *
 * @param {Object} event - EventBridge scheduled event
 */
exports.handler = async (event) => {
  console.log("[CronDispatcher] Received event:", JSON.stringify(event, null, 2));

  // Extract job name from EventBridge rule
  // The rule name should match the job key (e.g., "tier-maintenance")
  const jobName = extractJobName(event);

  if (!jobName) {
    console.error("[CronDispatcher] Could not determine job name from event");
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Unknown cron job" }),
    };
  }

  const jobConfig = CRON_JOBS[jobName];
  if (!jobConfig) {
    console.error(`[CronDispatcher] Unknown job: ${jobName}`);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `Unknown job: ${jobName}` }),
    };
  }

  console.log(
    `[CronDispatcher] Executing job: ${jobName} - ${jobConfig.description}`
  );

  // Acquire distributed lock
  const lockResult = await acquireLock(jobName, jobConfig.ttlMinutes);

  if (!lockResult.acquired) {
    console.log(
      `[CronDispatcher] Lock not acquired for ${jobName}. ` +
        `Another instance is running.`
    );
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Job skipped - another instance is running",
        jobName,
      }),
    };
  }

  try {
    // Execute the cron job by calling Vercel endpoint
    const result = await executeCronJob(jobName, jobConfig);

    console.log(`[CronDispatcher] Job ${jobName} completed:`, result);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Job executed successfully",
        jobName,
        result,
      }),
    };
  } catch (error) {
    console.error(`[CronDispatcher] Job ${jobName} failed:`, error);

    // Re-throw to trigger EventBridge retry
    throw error;
  } finally {
    // Always release the lock
    await releaseLock(jobName, lockResult.lockId);
  }
};

/**
 * Extract job name from EventBridge event
 */
function extractJobName(event) {
  // Method 1: From rule name in resources
  if (event.resources && event.resources.length > 0) {
    const ruleName = event.resources[0].split("/").pop();
    // Rule names are prefixed: "rewardspro-cron-tier-maintenance"
    const match = ruleName.match(/rewardspro-cron-(.+)/);
    if (match) return match[1];
    // Or direct match
    if (CRON_JOBS[ruleName]) return ruleName;
  }

  // Method 2: From detail-type
  if (event["detail-type"]) {
    const jobName = event["detail-type"].replace("Scheduled Event: ", "");
    if (CRON_JOBS[jobName]) return jobName;
  }

  // Method 3: From detail.jobName (custom field)
  if (event.detail?.jobName) {
    return event.detail.jobName;
  }

  // Method 4: From source
  if (event.source) {
    const match = event.source.match(/cron\.(.+)/);
    if (match && CRON_JOBS[match[1]]) return match[1];
  }

  return null;
}

/**
 * Execute cron job by calling Vercel endpoint
 */
async function executeCronJob(jobName, jobConfig) {
  if (!VERCEL_APP_URL) {
    throw new Error("VERCEL_APP_URL not configured");
  }

  const url = `${VERCEL_APP_URL}${jobConfig.endpoint}`;
  const startTime = Date.now();

  console.log(`[CronDispatcher] Calling ${url}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CRON_SECRET}`,
      "X-Cron-Source": "eventbridge",
      "X-Cron-Job": jobName,
    },
    body: JSON.stringify({
      source: "eventbridge",
      jobName,
      timestamp: new Date().toISOString(),
    }),
  });

  const duration = Date.now() - startTime;

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Cron endpoint error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  let result;
  try {
    result = await response.json();
  } catch {
    result = { status: "ok" };
  }

  return {
    ...result,
    durationMs: duration,
    endpoint: jobConfig.endpoint,
  };
}

/**
 * Acquire distributed lock using DynamoDB
 */
async function acquireLock(jobName, ttlMinutes) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + ttlMinutes * 60;
  const lockId = `${jobName}-${now}-${Math.random().toString(36).substr(2, 9)}`;

  const instanceId =
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    `lambda-${process.env.AWS_REGION || "unknown"}`;

  try {
    const command = new PutItemCommand({
      TableName: LOCKS_TABLE,
      Item: marshall({
        lockId: jobName,
        uniqueLockId: lockId,
        instanceId,
        acquiredAt: now,
        expiresAt,
        metadata: {
          source: "eventbridge-lambda",
          functionVersion: process.env.AWS_LAMBDA_FUNCTION_VERSION,
        },
      }),
      ConditionExpression:
        "attribute_not_exists(lockId) OR expiresAt < :now",
      ExpressionAttributeValues: marshall({
        ":now": now,
      }),
    });

    await dynamoClient.send(command);

    console.log(
      `[CronDispatcher] Acquired lock for ${jobName} ` +
        `(expires: ${new Date(expiresAt * 1000).toISOString()})`
    );

    return { acquired: true, lockId };
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      // Lock already held
      return { acquired: false };
    }
    console.error(`[CronDispatcher] Error acquiring lock for ${jobName}:`, error);
    return { acquired: false };
  }
}

/**
 * Release distributed lock
 */
async function releaseLock(jobName, lockId) {
  try {
    const command = new DeleteItemCommand({
      TableName: LOCKS_TABLE,
      Key: marshall({ lockId: jobName }),
      ConditionExpression: "uniqueLockId = :lockId",
      ExpressionAttributeValues: marshall({ ":lockId": lockId }),
    });

    await dynamoClient.send(command);
    console.log(`[CronDispatcher] Released lock for ${jobName}`);
  } catch (error) {
    console.warn(`[CronDispatcher] Error releasing lock for ${jobName}:`, error);
  }
}
