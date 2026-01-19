/**
 * Database Connection Utility
 *
 * Provides lazy initialization of Prisma client for CLI tools.
 * Handles connection pooling and proper cleanup.
 */

import { PrismaClient } from '@prisma/client';

// Singleton instance
let prismaInstance: PrismaClient | null = null;

export interface DbConfig {
  databaseUrl?: string;
  verbose?: boolean;
}

/**
 * Initialize or return existing Prisma client
 * Uses DATABASE_URL from environment if not provided
 */
export function getDb(config?: DbConfig): PrismaClient {
  if (prismaInstance) {
    return prismaInstance;
  }

  const databaseUrl = config?.databaseUrl || process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      '[DB] DATABASE_URL is required. Set it in environment or pass databaseUrl in config.'
    );
  }

  // Validate URL format
  if (!databaseUrl.startsWith('postgres://') && !databaseUrl.startsWith('postgresql://')) {
    throw new Error(
      '[DB] Invalid DATABASE_URL format. Must start with postgres:// or postgresql://'
    );
  }

  const logLevel = config?.verbose ? ['query', 'info', 'warn', 'error'] : ['error'];

  prismaInstance = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    log: logLevel as any,
  });

  return prismaInstance;
}

/**
 * Disconnect from database
 * Should be called when CLI exits
 */
export async function disconnectDb(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
}

/**
 * Check if database is connected and accessible
 */
export async function checkDbConnection(db?: PrismaClient): Promise<{
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
