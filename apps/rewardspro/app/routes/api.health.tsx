import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { getAuroraClient } from "~/utils/aurora-data-api";

/**
 * Health check endpoint to verify Data API connection
 * Access at: /api/health
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const startTime = Date.now();
  const results = {
    status: "checking",
    timestamp: new Date().toISOString(),
    environment: {
      VERCEL_ENV: process.env.VERCEL_ENV || "local",
      NODE_ENV: process.env.NODE_ENV || "development",
      AWS_REGION: process.env.AWS_REGION || "not-set",
    },
    dataAPI: {
      configured: false,
      connected: false,
      error: null as string | null,
      responseTime: 0,
    },
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

  // Add response headers for monitoring
  return json(results, {
    status: results.status === "healthy" ? 200 : results.status === "unconfigured" ? 503 : 500,
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "X-Response-Time": `${Date.now() - startTime}ms`,
    },
  });
}