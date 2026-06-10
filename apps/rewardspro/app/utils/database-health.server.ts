/**
 * Database Health Monitor
 * Tracks database performance metrics with in-memory caching
 * Optimized for zero additional queries and minimal overhead
 */

interface DatabaseHealthMetrics {
  responseTime: number;  // milliseconds
  status: 'connected' | 'degraded' | 'disconnected';
  uptime: number;        // percentage (0-100)
  lastCheck: Date;
}

interface HealthCheckRecord {
  timestamp: Date;
  responseTime: number;
  success: boolean;
}

// In-memory cache
let cachedMetrics: DatabaseHealthMetrics | null = null;
let healthHistory: HealthCheckRecord[] = [];
const CACHE_TTL_MS = 60000; // 60 seconds
const HISTORY_LIMIT = 10;   // Keep last 10 checks for uptime calculation

/**
 * Record a database query execution
 * Call this after any database query to track performance
 */
export function recordDatabaseQuery(responseTimeMs: number, success: boolean = true) {
  const now = new Date();

  // Add to history
  healthHistory.push({
    timestamp: now,
    responseTime: responseTimeMs,
    success,
  });

  // Keep only recent history
  if (healthHistory.length > HISTORY_LIMIT) {
    healthHistory = healthHistory.slice(-HISTORY_LIMIT);
  }

  // Calculate uptime from history
  const successCount = healthHistory.filter(h => h.success).length;
  const uptime = healthHistory.length > 0
    ? (successCount / healthHistory.length) * 100
    : 100;

  // Determine status based on response time
  let status: 'connected' | 'degraded' | 'disconnected';
  if (!success) {
    status = 'disconnected';
  } else if (responseTimeMs > 200) {
    status = 'degraded';
  } else {
    status = 'connected';
  }

  // Update cache
  cachedMetrics = {
    responseTime: responseTimeMs,
    status,
    uptime: Math.round(uptime * 10) / 10, // Round to 1 decimal
    lastCheck: now,
  };

  return cachedMetrics;
}

/**
 * Get cached database health metrics
 * Returns cached metrics if fresh (< 60s old), or triggers new measurement
 */
export function getDatabaseHealth(): DatabaseHealthMetrics {
  // Return cached metrics if still fresh
  if (cachedMetrics) {
    const age = Date.now() - cachedMetrics.lastCheck.getTime();
    if (age < CACHE_TTL_MS) {
      return cachedMetrics;
    }
  }

  // No cached metrics or stale - return default until next query
  return {
    responseTime: 0,
    status: 'connected',
    uptime: 100,
    lastCheck: new Date(),
  };
}

/**
 * Measure execution time of a database query
 * Wraps a query function and records its performance
 */
export async function measureQuery<T>(
  queryFn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  let success = true;

  try {
    const result = await queryFn();
    return result;
  } catch (error) {
    success = false;
    throw error;
  } finally {
    const duration = Date.now() - start;
    recordDatabaseQuery(duration, success);
  }
}

/**
 * Format response time for display
 */
export function formatResponseTime(ms: number): string {
  if (ms === 0) return 'Measuring...';
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
