/**
 * Database Connection Utility
 *
 * Provides lazy initialization of Prisma client for CLI tools, using the same
 * connection setup as the app (app/db.server.ts: DATABASE_URL, verified TLS).
 */

import type { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../../app/db.server';

// Singleton instance
let prismaInstance: PrismaClient | null = null;

export interface DbConfig {
  verbose?: boolean;
}

/**
 * Initialize or return existing Prisma client
 */
export function getDb(config?: DbConfig): PrismaClient {
  if (prismaInstance) {
    return prismaInstance;
  }

  if (config?.verbose) {
    console.log('[DB] Creating Prisma client...');
  }

  prismaInstance = createPrismaClient();
  return prismaInstance;
}

/**
 * Disconnect from database
 * Should be called when CLI exits
 */
export async function disconnectDb(): Promise<void> {
  await prismaInstance?.$disconnect();
  prismaInstance = null;
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
  } catch (error: unknown) {
    return {
      connected: false,
      latencyMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
