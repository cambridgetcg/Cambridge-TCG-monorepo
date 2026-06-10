/**
 * Connection Strategy for Vercel Deployments
 * 
 * Prevents database connection exhaustion by routing different
 * deployment types to appropriate connection methods.
 */

export type ConnectionType = 'rds-proxy' | 'data-api' | 'direct' | 'local';

export interface ConnectionStrategy {
  type: ConnectionType;
  maxConnections: number;
  idleTimeoutMs: number;
  poolTimeoutMs: number;
  description: string;
  useDataAPI: boolean;
}

/**
 * Determines the optimal connection strategy based on deployment environment
 */
export function getConnectionStrategy(): ConnectionStrategy {
  const vercelEnv = process.env.VERCEL_ENV;
  const nodeEnv = process.env.NODE_ENV;
  const forceDataAPI = process.env.FORCE_DATA_API === 'true';
  const isLocal = !vercelEnv && nodeEnv === 'development';

  // Force Data API for testing
  if (forceDataAPI) {
    return {
      type: 'data-api',
      maxConnections: 0,
      idleTimeoutMs: 0,
      poolTimeoutMs: 0,
      description: 'Forced Data API mode',
      useDataAPI: true,
    };
  }

  // Local development
  if (isLocal) {
    return {
      type: 'local',
      maxConnections: 10,
      idleTimeoutMs: 30000,
      poolTimeoutMs: 10000,
      description: 'Local development database',
      useDataAPI: false,
    };
  }

  // Vercel deployments
  switch (vercelEnv) {
    case 'production':
      // Only latest production deployment should use direct connections
      return {
        type: process.env.DATABASE_URL_PROXY ? 'rds-proxy' : 'direct',
        maxConnections: 5, // Limited for serverless
        idleTimeoutMs: 60000, // 1 minute
        poolTimeoutMs: 30000, // 30 seconds
        description: 'Production with connection pooling',
        useDataAPI: false,
      };

    case 'preview':
      // Preview deployments MUST use Data API to prevent exhaustion
      return {
        type: 'data-api',
        maxConnections: 0, // No persistent connections
        idleTimeoutMs: 0,
        poolTimeoutMs: 0,
        description: 'Preview deployment using Data API',
        useDataAPI: true,
      };

    case 'development':
      // Vercel development deployments (not local)
      return {
        type: 'data-api',
        maxConnections: 0,
        idleTimeoutMs: 0,
        poolTimeoutMs: 0,
        description: 'Development deployment using Data API',
        useDataAPI: true,
      };

    default:
      // Fallback to Data API for safety
      console.warn(`Unknown VERCEL_ENV: ${vercelEnv}, using Data API for safety`);
      return {
        type: 'data-api',
        maxConnections: 0,
        idleTimeoutMs: 0,
        poolTimeoutMs: 0,
        description: 'Unknown environment - defaulting to Data API',
        useDataAPI: true,
      };
  }
}

/**
 * Gets the appropriate database URL based on connection strategy
 */
export function getDatabaseUrl(): string | undefined {
  const strategy = getConnectionStrategy();

  switch (strategy.type) {
    case 'rds-proxy':
      return process.env.DATABASE_URL_PROXY || process.env.DATABASE_URL;
    case 'direct':
      return process.env.DATABASE_URL;
    case 'local':
      return process.env.DATABASE_URL_LOCAL || process.env.DATABASE_URL;
    case 'data-api':
      return undefined; // Data API doesn't use connection strings
    default:
      return process.env.DATABASE_URL;
  }
}

/**
 * Logs the current connection strategy (useful for debugging)
 */
export function logConnectionStrategy(): void {
  const strategy = getConnectionStrategy();
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID;
  const gitCommit = process.env.VERCEL_GIT_COMMIT_SHA;

  console.log('🔌 Database Connection Strategy:', {
    environment: process.env.VERCEL_ENV || 'local',
    strategy: strategy.type,
    description: strategy.description,
    maxConnections: strategy.maxConnections,
    useDataAPI: strategy.useDataAPI,
    deploymentId: deploymentId?.substring(0, 8),
    gitCommit: gitCommit?.substring(0, 8),
  });
}

/**
 * Checks if current environment should use Data API
 */
export function shouldUseDataAPI(): boolean {
  return getConnectionStrategy().useDataAPI;
}

/**
 * Gets connection pool configuration for Prisma
 */
export function getPrismaConnectionConfig() {
  const strategy = getConnectionStrategy();

  if (strategy.useDataAPI) {
    return null; // Data API doesn't use Prisma's connection pool
  }

  return {
    connection_limit: strategy.maxConnections,
    connect_timeout: 30, // 30 seconds for Aurora cold start
    pool_timeout: strategy.poolTimeoutMs / 1000,
    idle_in_transaction_session_timeout: strategy.idleTimeoutMs,
    statement_timeout: 20000, // 20 seconds max query time
  };
}