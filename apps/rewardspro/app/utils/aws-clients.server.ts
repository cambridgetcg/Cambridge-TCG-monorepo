/**
 * AWS Client Factory
 * Centralized AWS SDK client management with singleton pattern
 *
 * Provides lazy initialization and configuration for all AWS services used:
 * - SQS (Order Queue)
 * - DynamoDB (Cron Locks)
 * - S3 (Data Exports)
 * - SES (Email)
 * - ElastiCache (Redis - via ioredis, not AWS SDK)
 */

import { SQSClient } from "@aws-sdk/client-sqs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { SESClient } from "@aws-sdk/client-ses";
import { SNSClient } from "@aws-sdk/client-sns";

// Environment configuration
const AWS_REGION = process.env.AWS_REGION || "eu-north-1";

// Client instances (singletons)
let sqsClient: SQSClient | null = null;
let dynamoDBClient: DynamoDBClient | null = null;
let dynamoDBDocClient: DynamoDBDocumentClient | null = null;
let s3Client: S3Client | null = null;
let sesClient: SESClient | null = null;
let snsClient: SNSClient | null = null;

/**
 * AWS Client configuration interface
 */
export interface AWSClientConfig {
  region?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
}

/**
 * Get default AWS configuration
 */
function getDefaultConfig(): AWSClientConfig {
  const config: AWSClientConfig = {
    region: AWS_REGION,
  };

  // Only set explicit credentials if provided (otherwise uses IAM role/env vars)
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }

  return config;
}

/**
 * Get or create SQS client instance
 * Used for order queue processing
 */
export function getSQSClient(): SQSClient {
  if (!sqsClient) {
    sqsClient = new SQSClient(getDefaultConfig());
    console.log(`[AWS] SQS client initialized (region: ${AWS_REGION})`);
  }
  return sqsClient;
}

/**
 * Get or create DynamoDB client instance
 * Used for cron job distributed locks
 */
export function getDynamoDBClient(): DynamoDBClient {
  if (!dynamoDBClient) {
    dynamoDBClient = new DynamoDBClient(getDefaultConfig());
    console.log(`[AWS] DynamoDB client initialized (region: ${AWS_REGION})`);
  }
  return dynamoDBClient;
}

/**
 * Get or create DynamoDB Document client instance
 * Provides simplified API with automatic marshalling/unmarshalling
 */
export function getDynamoDBDocClient(): DynamoDBDocumentClient {
  if (!dynamoDBDocClient) {
    const client = getDynamoDBClient();
    dynamoDBDocClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: {
        convertEmptyValues: false,
        removeUndefinedValues: true,
        convertClassInstanceToMap: true,
      },
      unmarshallOptions: {
        wrapNumbers: false,
      },
    });
    console.log(`[AWS] DynamoDB Document client initialized`);
  }
  return dynamoDBDocClient;
}

/**
 * Get or create S3 client instance
 * Used for data exports and file storage
 */
export function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client(getDefaultConfig());
    console.log(`[AWS] S3 client initialized (region: ${AWS_REGION})`);
  }
  return s3Client;
}

/**
 * Get or create SES client instance
 * Used for email sending
 */
export function getSESClient(): SESClient {
  if (!sesClient) {
    // SES may be in a different region (e.g., us-east-1 for sandbox)
    const sesRegion = process.env.AWS_SES_REGION || AWS_REGION;
    sesClient = new SESClient({
      ...getDefaultConfig(),
      region: sesRegion,
    });
    console.log(`[AWS] SES client initialized (region: ${sesRegion})`);
  }
  return sesClient;
}

/**
 * Get or create SNS client instance
 * Used for event publishing and fan-out
 */
export function getSNSClient(): SNSClient {
  if (!snsClient) {
    snsClient = new SNSClient(getDefaultConfig());
    console.log(`[AWS] SNS client initialized (region: ${AWS_REGION})`);
  }
  return snsClient;
}

/**
 * Environment variable getters with validation
 */
export function getAWSConfig() {
  return {
    region: AWS_REGION,

    // SQS Configuration
    sqs: {
      orderQueueUrl: process.env.AWS_SQS_ORDER_QUEUE_URL || "",
      dlqUrl: process.env.AWS_SQS_DLQ_URL || "",
      enabled: process.env.USE_SQS_QUEUE === "true",
    },

    // DynamoDB Configuration
    dynamodb: {
      locksTable: process.env.AWS_DYNAMODB_LOCKS_TABLE || "rewardspro-cron-locks",
      enabled: process.env.USE_DYNAMODB_LOCKS === "true",
    },

    // S3 Configuration
    s3: {
      exportsBucket: process.env.AWS_S3_EXPORTS_BUCKET || "",
      enabled: !!process.env.AWS_S3_EXPORTS_BUCKET,
    },

    // SES Configuration
    ses: {
      region: process.env.AWS_SES_REGION || AWS_REGION,
      fromEmail: process.env.AWS_SES_FROM_EMAIL || "",
      enabled: process.env.USE_SES_EMAIL === "true",
    },

    // ElastiCache Configuration
    elasticache: {
      endpoint: process.env.ELASTICACHE_ENDPOINT || "",
      port: parseInt(process.env.ELASTICACHE_PORT || "6379", 10),
      enabled: process.env.USE_ELASTICACHE === "true",
    },

    // SNS Configuration
    sns: {
      orderProcessedTopicArn: process.env.AWS_SNS_ORDER_PROCESSED_TOPIC_ARN || "",
      customerUpdatedTopicArn: process.env.AWS_SNS_CUSTOMER_UPDATED_TOPIC_ARN || "",
      tierChangedTopicArn: process.env.AWS_SNS_TIER_CHANGED_TOPIC_ARN || "",
      pointsEarnedTopicArn: process.env.AWS_SNS_POINTS_EARNED_TOPIC_ARN || "",
      enabled: process.env.USE_SNS_EVENTS === "true",
    },

    // Email Queue Configuration
    emailQueue: {
      queueUrl: process.env.AWS_SQS_EMAIL_QUEUE_URL || "",
      dlqUrl: process.env.AWS_SQS_EMAIL_DLQ_URL || "",
      enabled: process.env.USE_SQS_EMAIL_QUEUE === "true",
    },

    // Klaviyo Queue Configuration
    klaviyoQueue: {
      queueUrl: process.env.AWS_SQS_KLAVIYO_QUEUE_URL || "",
      dlqUrl: process.env.AWS_SQS_KLAVIYO_DLQ_URL || "",
      enabled: process.env.USE_SQS_KLAVIYO_QUEUE === "true",
    },
  };
}

/**
 * Validate AWS configuration for a specific service
 */
export function validateAWSConfig(service: "sqs" | "dynamodb" | "s3" | "ses" | "elasticache" | "sns" | "emailQueue" | "klaviyoQueue"): {
  valid: boolean;
  missing: string[];
} {
  const missing: string[] = [];

  switch (service) {
    case "sqs":
      if (!process.env.AWS_SQS_ORDER_QUEUE_URL) missing.push("AWS_SQS_ORDER_QUEUE_URL");
      break;
    case "dynamodb":
      if (!process.env.AWS_DYNAMODB_LOCKS_TABLE) missing.push("AWS_DYNAMODB_LOCKS_TABLE");
      break;
    case "s3":
      if (!process.env.AWS_S3_EXPORTS_BUCKET) missing.push("AWS_S3_EXPORTS_BUCKET");
      break;
    case "ses":
      if (!process.env.AWS_SES_FROM_EMAIL) missing.push("AWS_SES_FROM_EMAIL");
      break;
    case "elasticache":
      if (!process.env.ELASTICACHE_ENDPOINT) missing.push("ELASTICACHE_ENDPOINT");
      break;
    case "sns":
      if (!process.env.AWS_SNS_ORDER_PROCESSED_TOPIC_ARN) missing.push("AWS_SNS_ORDER_PROCESSED_TOPIC_ARN");
      break;
    case "emailQueue":
      if (!process.env.AWS_SQS_EMAIL_QUEUE_URL) missing.push("AWS_SQS_EMAIL_QUEUE_URL");
      break;
    case "klaviyoQueue":
      if (!process.env.AWS_SQS_KLAVIYO_QUEUE_URL) missing.push("AWS_SQS_KLAVIYO_QUEUE_URL");
      break;
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Reset all clients (useful for testing)
 */
export function resetAWSClients(): void {
  sqsClient = null;
  dynamoDBClient = null;
  dynamoDBDocClient = null;
  s3Client = null;
  sesClient = null;
  snsClient = null;
  console.log("[AWS] All clients reset");
}

/**
 * Check if AWS services are properly configured
 */
export function getAWSStatus(): {
  sqs: { configured: boolean; enabled: boolean };
  dynamodb: { configured: boolean; enabled: boolean };
  s3: { configured: boolean; enabled: boolean };
  ses: { configured: boolean; enabled: boolean };
  elasticache: { configured: boolean; enabled: boolean };
  sns: { configured: boolean; enabled: boolean };
  emailQueue: { configured: boolean; enabled: boolean };
  klaviyoQueue: { configured: boolean; enabled: boolean };
} {
  const config = getAWSConfig();

  return {
    sqs: {
      configured: !!config.sqs.orderQueueUrl,
      enabled: config.sqs.enabled,
    },
    dynamodb: {
      configured: !!config.dynamodb.locksTable,
      enabled: config.dynamodb.enabled,
    },
    s3: {
      configured: !!config.s3.exportsBucket,
      enabled: config.s3.enabled,
    },
    ses: {
      configured: !!config.ses.fromEmail,
      enabled: config.ses.enabled,
    },
    elasticache: {
      configured: !!config.elasticache.endpoint,
      enabled: config.elasticache.enabled,
    },
    sns: {
      configured: !!config.sns.orderProcessedTopicArn,
      enabled: config.sns.enabled,
    },
    emailQueue: {
      configured: !!config.emailQueue.queueUrl,
      enabled: config.emailQueue.enabled,
    },
    klaviyoQueue: {
      configured: !!config.klaviyoQueue.queueUrl,
      enabled: config.klaviyoQueue.enabled,
    },
  };
}
