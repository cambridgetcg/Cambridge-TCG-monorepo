/**
 * Aurora Serverless Connection Manager
 * Optimizations for AWS Aurora Serverless to prevent cold starts and connection issues
 */

import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";

// Configuration for Aurora Serverless
export const AURORA_CONFIG = {
  // Connection pool settings
  connectionPool: {
    min: 1,          // Keep at least 1 connection warm
    max: 10,         // Maximum connections
    idleTimeout: 30, // Seconds before closing idle connection
  },

  // Retry configuration for transient errors
  retry: {
    maxAttempts: 3,
    baseDelay: 100,  // ms
    maxDelay: 5000,  // ms
  },

  // Timeout settings
  timeouts: {
    statement: 4000,  // 4 seconds for statement execution
    transaction: 4500, // 4.5 seconds for full transaction
  },

  // Aurora capacity settings (for v2)
  capacity: {
    minACUs: 1,    // Keep at least 1 ACU to prevent cold starts
    maxACUs: 4,    // Scale up to 4 ACUs under load
  }
};

/**
 * Keep Aurora cluster warm to prevent cold starts
 * This should be called periodically (e.g., every 5 minutes)
 */
export async function keepAuroraWarm(client: RDSDataClient): Promise<void> {
  const warmupQuery = new ExecuteStatementCommand({
    resourceArn: process.env.AURORA_RESOURCE_ARN!,
    secretArn: process.env.AURORA_SECRET_ARN!,
    database: process.env.AURORA_DATABASE_NAME!,
    sql: "SELECT 1 as warmup",
  });

  try {
    const start = Date.now();
    await client.send(warmupQuery);
    const duration = Date.now() - start;

    console.log(`[Aurora] Warmup query completed in ${duration}ms`);

    // Warn if cluster was likely cold
    if (duration > 5000) {
      console.warn(`[Aurora] Cluster appears to have been cold (warmup took ${duration}ms)`);
    }
  } catch (error: any) {
    console.error("[Aurora] Warmup query failed:", error.message);
  }
}

/**
 * Check Aurora cluster status and capacity
 */
export async function checkAuroraHealth(client: RDSDataClient): Promise<{
  healthy: boolean;
  responseTime: number;
  error?: string;
}> {
  const healthQuery = new ExecuteStatementCommand({
    resourceArn: process.env.AURORA_RESOURCE_ARN!,
    secretArn: process.env.AURORA_SECRET_ARN!,
    database: process.env.AURORA_DATABASE_NAME!,
    sql: `
      SELECT
        current_database() as database,
        current_timestamp as server_time,
        pg_database_size(current_database()) as size_bytes,
        (SELECT count(*) FROM pg_stat_activity) as active_connections
    `,
  });

  try {
    const start = Date.now();
    const result = await client.send(healthQuery);
    const responseTime = Date.now() - start;

    const records = result.records || [];
    if (records.length > 0) {
      const dbInfo = {
        database: records[0][0]?.stringValue,
        serverTime: records[0][1]?.stringValue,
        sizeBytes: records[0][2]?.longValue,
        activeConnections: records[0][3]?.longValue,
      };

      console.log("[Aurora] Health check:", {
        ...dbInfo,
        responseTime
      });
    }

    return {
      healthy: true,
      responseTime,
    };
  } catch (error: any) {
    return {
      healthy: false,
      responseTime: -1,
      error: error.message,
    };
  }
}

/**
 * Monitor connection pool status
 */
export async function getConnectionPoolStatus(client: RDSDataClient): Promise<{
  activeConnections: number;
  idleConnections: number;
  maxConnections: number;
  waitingRequests: number;
}> {
  const poolQuery = new ExecuteStatementCommand({
    resourceArn: process.env.AURORA_RESOURCE_ARN!,
    secretArn: process.env.AURORA_SECRET_ARN!,
    database: process.env.AURORA_DATABASE_NAME!,
    sql: `
      SELECT
        count(*) FILTER (WHERE state = 'active') as active,
        count(*) FILTER (WHERE state = 'idle') as idle,
        count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction,
        max_connections::int as max_connections
      FROM pg_stat_activity, pg_settings
      WHERE pg_settings.name = 'max_connections'
      GROUP BY max_connections
    `,
  });

  try {
    const result = await client.send(poolQuery);
    const records = result.records || [];

    if (records.length > 0) {
      return {
        activeConnections: Number(records[0][0]?.longValue || 0),
        idleConnections: Number(records[0][1]?.longValue || 0),
        maxConnections: Number(records[0][3]?.longValue || 100),
        waitingRequests: 0, // Data API doesn't queue like traditional pools
      };
    }

    return {
      activeConnections: 0,
      idleConnections: 0,
      maxConnections: 100,
      waitingRequests: 0,
    };
  } catch (error: any) {
    console.error("[Aurora] Failed to get pool status:", error.message);
    throw error;
  }
}

/**
 * Detect and log slow queries
 */
export async function getSlowQueries(client: RDSDataClient, thresholdMs: number = 1000): Promise<Array<{
  query: string;
  duration: number;
  state: string;
}>> {
  const slowQueryCheck = new ExecuteStatementCommand({
    resourceArn: process.env.AURORA_RESOURCE_ARN!,
    secretArn: process.env.AURORA_SECRET_ARN!,
    database: process.env.AURORA_DATABASE_NAME!,
    sql: `
      SELECT
        query,
        EXTRACT(EPOCH FROM (now() - query_start)) * 1000 as duration_ms,
        state
      FROM pg_stat_activity
      WHERE state != 'idle'
        AND query_start < now() - interval '${thresholdMs} milliseconds'
      ORDER BY duration_ms DESC
      LIMIT 10
    `,
  });

  try {
    const result = await client.send(slowQueryCheck);
    const records = result.records || [];

    return records.map(record => ({
      query: record[0]?.stringValue || '',
      duration: Number(record[1]?.doubleValue || 0),
      state: record[2]?.stringValue || '',
    }));
  } catch (error: any) {
    console.error("[Aurora] Failed to get slow queries:", error.message);
    return [];
  }
}

/**
 * Retry logic for transient Aurora errors
 */
export async function withAuroraRetry<T>(
  operation: () => Promise<T>,
  config = AURORA_CONFIG.retry
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // Check if error is retryable
      const isRetryable =
        error.code === 'StatementTimeoutException' ||
        error.code === 'TooManyRequestsException' ||
        error.code === 'ServiceUnavailable' ||
        error.message?.includes('connection') ||
        error.message?.includes('timeout') ||
        error.message?.includes('starting up');

      if (!isRetryable || attempt === config.maxAttempts - 1) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        config.baseDelay * Math.pow(2, attempt),
        config.maxDelay
      );

      console.warn(`[Aurora] Retrying after ${delay}ms (attempt ${attempt + 1}/${config.maxAttempts}):`, error.message);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Connection pool warmer for Lambda/serverless environments
 * Call this in the Lambda handler initialization
 */
export class AuroraConnectionWarmer {
  private warmupInterval?: NodeJS.Timeout;
  private client: RDSDataClient;

  constructor(client: RDSDataClient) {
    this.client = client;
  }

  /**
   * Start periodic warmup to keep connections alive
   */
  startWarmup(intervalMs: number = 5 * 60 * 1000): void {
    // Initial warmup
    keepAuroraWarm(this.client).catch(err =>
      console.error("[Aurora] Initial warmup failed:", err)
    );

    // Schedule periodic warmups
    this.warmupInterval = setInterval(() => {
      keepAuroraWarm(this.client).catch(err =>
        console.error("[Aurora] Periodic warmup failed:", err)
      );
    }, intervalMs);

    console.log(`[Aurora] Connection warmer started (interval: ${intervalMs}ms)`);
  }

  /**
   * Stop the warmup process
   */
  stopWarmup(): void {
    if (this.warmupInterval) {
      clearInterval(this.warmupInterval);
      this.warmupInterval = undefined;
      console.log("[Aurora] Connection warmer stopped");
    }
  }
}

/**
 * Prisma connection URL builder for Aurora
 * Helps ensure proper connection parameters
 */
export function buildAuroraPrismaUrl(): string {
  // For Aurora Data API, we use a placeholder URL
  // The actual connection is handled by the Data API adapter
  return "postgresql://placeholder:placeholder@localhost:5432/placeholder";
}

/**
 * Check if an error indicates Aurora is starting up (cold start)
 */
export function isAuroraColdStartError(error: any): boolean {
  const errorMessage = error?.message?.toLowerCase() || '';
  return errorMessage.includes('database system is starting up') ||
         errorMessage.includes('cluster is paused') ||
         errorMessage.includes('aurora serverless is scaling');
}