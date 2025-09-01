/**
 * Database Client with AWS Aurora Data API
 * 
 * This module provides database access using AWS Aurora Data API
 * for serverless, connection-less database operations.
 */

import { createDataAPIPrismaClient } from "./utils/prisma-data-api-adapter";
import { logConnectionStrategy } from "./utils/connection-strategy";

declare global {
  var dbClient: ReturnType<typeof createDataAPIPrismaClient> | undefined;
}

// Log connection strategy on startup
if (process.env.NODE_ENV !== "test") {
  logConnectionStrategy();
  console.log("⚡ Using AWS Aurora Data API for all database operations");
}

/**
 * Creates a database client using Aurora Data API
 * This provides a Prisma-compatible interface without persistent connections
 */
function createDatabaseClient() {
  return createDataAPIPrismaClient();
}

// Create singleton instance
const db = global.dbClient ?? createDatabaseClient();

// Store in global for development (prevents recreation on hot reload)
if (process.env.NODE_ENV !== "production") {
  global.dbClient = db;
}

// Export the database client
export default db;

// For backward compatibility
export { db as prisma };

// Export helper to indicate we're always using Data API
export const isUsingDataAPI = true;