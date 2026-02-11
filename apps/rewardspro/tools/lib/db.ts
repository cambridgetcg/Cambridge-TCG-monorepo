/**
 * Database Connection Utility
 *
 * Provides lazy initialization of Prisma client for CLI tools.
 * Uses Aurora Data API adapter (same as the app) instead of direct PrismaClient.
 */

import { createDataAPIPrismaClient } from '../../app/utils/prisma-data-api-adapter';

// Singleton instance
let prismaInstance: ReturnType<typeof createDataAPIPrismaClient> | null = null;

export interface DbConfig {
  verbose?: boolean;
}

/**
 * Initialize or return existing Prisma client via Data API
 */
export function getDb(config?: DbConfig): ReturnType<typeof createDataAPIPrismaClient> {
  if (prismaInstance) {
    return prismaInstance;
  }

  if (config?.verbose) {
    console.log('[DB] Creating Data API Prisma client...');
  }

  prismaInstance = createDataAPIPrismaClient();
  return prismaInstance;
}

/**
 * Disconnect from database
 * Should be called when CLI exits
 */
export async function disconnectDb(): Promise<void> {
  // Data API client doesn't maintain persistent connections,
  // but we clear the singleton for clean state
  prismaInstance = null;
}

/**
 * Check if database is connected and accessible
 */
export async function checkDbConnection(db?: ReturnType<typeof createDataAPIPrismaClient>): Promise<{
  connected: boolean;
  latencyMs: number;
  error?: string;
}> {
  const client = db || prismaInstance;
  if (!client) {
    return {
      connected: false,
      latencyMs: 0,
      error: 'No database client initialized',
    };
  }

  const startTime = Date.now();
  try {
    await client.$queryRaw`SELECT 1`;
    return {
      connected: true,
      latencyMs: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      connected: false,
      latencyMs: Date.now() - startTime,
      error: error.message,
    };
  }
}
