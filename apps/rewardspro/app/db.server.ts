import { PrismaClient } from "@prisma/client";
import {
  getConnectionStrategy,
  getDatabaseUrl,
  shouldUseDataAPI,
  getPrismaConnectionConfig,
  logConnectionStrategy,
} from "./utils/connection-strategy";
import { getAuroraClient } from "./utils/aurora-data-api";

declare global {
  var prismaGlobal: PrismaClient | undefined;
  var dataAPIClient: any | undefined;
}

// Log connection strategy on startup
if (process.env.NODE_ENV !== "test") {
  logConnectionStrategy();
}

/**
 * Creates a Prisma client with appropriate connection strategy
 */
const createPrismaClient = () => {
  const strategy = getConnectionStrategy();
  const databaseUrl = getDatabaseUrl();

  // For Data API strategy, we'll use a custom adapter (to be implemented)
  if (strategy.useDataAPI) {
    console.log("⚡ Using Aurora Data API for database access");
    // For now, create a minimal Prisma client that will be replaced with Data API adapter
    // This prevents connection pool creation for preview deployments
    return new PrismaClient({
      datasources: {
        db: {
          // Use a dummy URL that won't create connections
          url: "postgresql://dummy:dummy@localhost:5432/dummy",
        },
      },
      log: ["error"],
    });
  }

  // For direct connections (production, local)
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not defined. Please check your environment variables."
    );
  }

  const poolConfig = getPrismaConnectionConfig();
  const connectionUrl = new URL(databaseUrl);

  // Add connection pool parameters to URL
  if (poolConfig) {
    connectionUrl.searchParams.set(
      "connection_limit",
      poolConfig.connection_limit.toString()
    );
    connectionUrl.searchParams.set(
      "pool_timeout",
      poolConfig.pool_timeout.toString()
    );
    connectionUrl.searchParams.set(
      "connect_timeout",
      poolConfig.connect_timeout.toString()
    );
    connectionUrl.searchParams.set(
      "statement_timeout",
      poolConfig.statement_timeout.toString()
    );
  }

  console.log(`🔌 Database connection type: ${strategy.type}`);
  console.log(`   Max connections: ${strategy.maxConnections}`);
  
  return new PrismaClient({
    datasources: {
      db: {
        url: connectionUrl.toString(),
      },
    },
    log: process.env.NODE_ENV === "development" 
      ? ["query", "error", "warn"] 
      : ["error"],
  });
};

/**
 * Gets or creates the appropriate database client based on environment
 */
function getDbClient() {
  if (shouldUseDataAPI()) {
    // Return Aurora Data API client for preview/development deployments
    if (!global.dataAPIClient) {
      global.dataAPIClient = getAuroraClient();
    }
    return global.dataAPIClient;
  }

  // Return Prisma client for production/local
  if (!global.prismaGlobal) {
    global.prismaGlobal = createPrismaClient();
  }
  return global.prismaGlobal;
}

// Create singleton instance
const prisma = global.prismaGlobal ?? createPrismaClient();

// Store in global for development (prevents recreation on hot reload)
if (process.env.NODE_ENV !== "production") {
  global.prismaGlobal = prisma;
}

// Export helper to check if using Data API
export const isUsingDataAPI = shouldUseDataAPI();

// Export the client
export default prisma;

// Export a helper function to get the correct client
export function getDatabase() {
  return shouldUseDataAPI() ? getAuroraClient() : prisma;
}