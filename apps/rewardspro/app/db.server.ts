/**
 * Database Client
 * 
 * Uses AWS Aurora Data API instead of direct database connections
 * This prevents connection pool exhaustion in serverless environments
 */

import { createDataAPIPrismaClient } from "./utils/prisma-data-api-adapter";

declare global {
  var prisma: ReturnType<typeof createDataAPIPrismaClient> | undefined;
}

// Create the Data API client
const prisma = global.prisma || createDataAPIPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

export default prisma;
export { prisma as db };

// Export helper to indicate we're using Data API
export const isUsingDataAPI = true;