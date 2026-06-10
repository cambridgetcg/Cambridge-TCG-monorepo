import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { getAuroraClient } from "../utils/aurora-data-api";
import { DatadogService } from "../services/monitoring/datadog.service";
import { Logger } from "../services/logger.service";
import { getCacheBackendInfo, getCacheStats } from "../utils/analytics-cache.server";

/**
 * Health check endpoint to verify Data API connection and system health
 * Access at: /api/health
 *
 * Query parameters:
 * - ?detailed=true - Include detailed health checks
 * - ?checks=memory,database,monitoring - Specific checks to run
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const startTime = Date.now();
  const url = new URL(request.url);
  const detailed = url.searchParams.get('detailed') === 'true';
  const specificChecks = url.searchParams.get('checks')?.split(',') || [];

  const results = {
    status: "checking",
    timestamp: new Date().toISOString(),
    responseTime: 0,
    environment: {
      VERCEL_ENV: process.env.VERCEL_ENV || "local",
      NODE_ENV: process.env.NODE_ENV || "development",
      AWS_REGION: process.env.AWS_REGION || "not-set",
      APP_VERSION: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || "unknown",
    },
    memory: {} as any,
    dataAPI: {
      configured: false,
      connected: false,
      error: null as string | null,
      responseTime: 0,
    },
    monitoring: {
      datadog: "unknown",
      sentry: "unknown",
      logging: "operational",
    },
    cache: {
      backend: "checking",
      description: "",
      kvConfigured: false,
    } as any,
    aurora: {
      resourceArn: process.env.AURORA_RESOURCE_ARN ? "✅ Set" : "❌ Missing",
      secretArn: process.env.AURORA_SECRET_ARN ? "✅ Set" : "❌ Missing",
      databaseName: process.env.AURORA_DATABASE_NAME || "not-set",
    },
    aws: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ? "✅ Set" : "❌ Missing",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ? "✅ Set" : "❌ Missing",
      region: process.env.AWS_REGION || "not-set",
    },
  };

  // Memory health check
  if (!specificChecks.length || specificChecks.includes('memory')) {
    const memoryUsage = process.memoryUsage();
    const formatBytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

    results.memory = {
      heapUsed: formatBytes(memoryUsage.heapUsed),
      heapTotal: formatBytes(memoryUsage.heapTotal),
      rss: formatBytes(memoryUsage.rss),
      external: formatBytes(memoryUsage.external),
      arrayBuffers: formatBytes(memoryUsage.arrayBuffers),
      heapUsagePercent: ((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100).toFixed(2) + '%',
    };

    // Warn if memory usage is high
    if (memoryUsage.heapUsed / memoryUsage.heapTotal > 0.9) {
      results.status = "degraded";
      results.memory.warning = "High memory usage detected";

      // Track metric
      DatadogService.metrics.gauge('health.memory.heap_usage_percent',
        (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100
      );
    }
  }

  // Cache backend check (Vercel KV or memory fallback)
  if (!specificChecks.length || specificChecks.includes('cache')) {
    try {
      const cacheInfo = getCacheBackendInfo();
      const cacheStats = await getCacheStats();
      results.cache = {
        backend: cacheInfo.backend,
        description: cacheInfo.description,
        kvConfigured: cacheStats.isKVConfigured,
        status: cacheInfo.backend === 'vercel-kv' ? '✅ Vercel KV (persistent)' : '⚠️ Memory (not persistent)',
        ...(cacheStats.memoryEntries !== undefined && { memoryEntries: cacheStats.memoryEntries }),
      };
    } catch (error) {
      results.cache = {
        backend: 'error',
        description: 'Failed to check cache status',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Monitoring service checks
  if (!specificChecks.length || specificChecks.includes('monitoring')) {
    // Check Datadog
    if (process.env.DD_API_KEY) {
      try {
        // Send a test metric
        DatadogService.metrics.increment('health.check');
        results.monitoring.datadog = "operational";
      } catch (error) {
        results.monitoring.datadog = "error";
        Logger.error('Health check: Datadog error', error as Error);
      }
    } else {
      results.monitoring.datadog = "not configured";
    }

    // Check Sentry
    if (process.env.SENTRY_DSN) {
      results.monitoring.sentry = "configured";
      // Can't easily test Sentry connectivity without sending an actual error
    } else {
      results.monitoring.sentry = "not configured";
    }
  }

  // Check if Data API is configured
  if (
    process.env.AURORA_RESOURCE_ARN &&
    process.env.AURORA_SECRET_ARN &&
    process.env.AURORA_DATABASE_NAME &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  ) {
    results.dataAPI.configured = true;

    // Try to connect and run a simple query
    try {
      const client = getAuroraClient();
      
      // Run a simple query to test the connection
      const testQuery = "SELECT 1 as test, NOW() as current_time";
      const queryResult = await client.executeStatement(testQuery);
      
      results.dataAPI.connected = true;
      results.dataAPI.responseTime = Date.now() - startTime;
      results.status = "healthy";

      // Add query result to show it's working
      if (queryResult.records && queryResult.records.length > 0) {
        results.dataAPI = {
          ...results.dataAPI,
          testQuery: {
            success: true,
            result: queryResult.records[0],
            recordsReturned: queryResult.records.length,
          },
        } as any;
      }

      // Try to get database version
      try {
        const versionQuery = "SELECT version() as db_version";
        const versionResult = await client.executeStatement(versionQuery);
        if (versionResult.records && versionResult.records.length > 0) {
          results.aurora = {
            ...results.aurora,
            databaseVersion: versionResult.records[0].db_version,
          } as any;
        }
      } catch (versionError) {
        // Non-critical, ignore
      }

      // Try to count tables (to verify schema exists)
      try {
        const tablesQuery = `
          SELECT COUNT(*) as table_count 
          FROM information_schema.tables 
          WHERE table_schema = 'public'
        `;
        const tablesResult = await client.executeStatement(tablesQuery);
        if (tablesResult.records && tablesResult.records.length > 0) {
          results.dataAPI = {
            ...results.dataAPI,
            schemaInfo: {
              publicTables: tablesResult.records[0].table_count,
            },
          } as any;
        }
      } catch (tablesError) {
        // Non-critical, ignore
      }

    } catch (error) {
      results.status = "unhealthy";
      results.dataAPI.connected = false;
      results.dataAPI.error = error instanceof Error ? error.message : String(error);
      
      // Add more specific error details
      if (error instanceof Error) {
        results.dataAPI = {
          ...results.dataAPI,
          errorDetails: {
            name: error.name,
            message: error.message,
            stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
          },
        } as any;
      }
    }
  } else {
    results.status = "unconfigured";
    results.dataAPI.error = "Missing required environment variables";
  }

  // Calculate final response time
  results.responseTime = Date.now() - startTime;

  // Log health check result
  if (results.status !== "healthy") {
    Logger.warn('Health check failed', {
      status: results.status,
      dataAPI: results.dataAPI,
      memory: results.memory,
    });

    // Track unhealthy status
    DatadogService.metrics.increment('health.check.unhealthy');
  } else {
    // Track healthy status and response time
    DatadogService.metrics.increment('health.check.healthy');
    DatadogService.metrics.timing('health.check.response_time', results.responseTime);
  }

  // Add response headers for monitoring
  return json(results, {
    status: results.status === "healthy" ? 200 : results.status === "unconfigured" ? 503 : 500,
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "X-Response-Time": `${results.responseTime}ms`,
      "X-Health-Status": results.status,
    },
  });
}