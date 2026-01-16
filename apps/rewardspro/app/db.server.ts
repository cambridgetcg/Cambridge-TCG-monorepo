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

const LOG_PREFIX = "[db.server]";

console.log(`${LOG_PREFIX} Module loading...`);
console.log(`${LOG_PREFIX} NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`${LOG_PREFIX} global.prisma exists: ${!!global.prisma}`);

// Create the Data API client
let prisma: ReturnType<typeof createDataAPIPrismaClient>;

try {
  if (global.prisma) {
    console.log(`${LOG_PREFIX} Reusing existing global prisma client`);
    prisma = global.prisma;
  } else {
    console.log(`${LOG_PREFIX} Creating new Data API Prisma client...`);
    prisma = createDataAPIPrismaClient();
    console.log(`${LOG_PREFIX} Data API client created successfully`);
  }

  // Log what models are available
  if (prisma) {
    const modelKeys = Object.keys(prisma);
    console.log(`${LOG_PREFIX} Client has ${modelKeys.length} keys`);
    console.log(`${LOG_PREFIX} Has pointsConfig: ${!!prisma.pointsConfig}`);
    console.log(`${LOG_PREFIX} Has pointsLedger: ${!!prisma.pointsLedger}`);
    console.log(`${LOG_PREFIX} Has customer: ${!!prisma.customer}`);
    console.log(`${LOG_PREFIX} Has shopSettings: ${!!prisma.shopSettings}`);
  }
} catch (error) {
  console.error(`${LOG_PREFIX} CRITICAL ERROR creating Data API client:`, error);
  throw error;
}

if (process.env.NODE_ENV !== "production") {
  console.log(`${LOG_PREFIX} Caching client in global (non-production)`);
  global.prisma = prisma;
}

export default prisma;
export { prisma as db };

// Export helper to indicate we're using Data API
export const isUsingDataAPI = true;

console.log(`${LOG_PREFIX} Module loaded successfully`);