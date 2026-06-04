/**
 * Authentication logging and monitoring utilities
 * 
 * Provides structured logging for authentication flows,
 * monitoring metrics, and debugging capabilities
 */

import crypto from 'node:crypto';

// Log levels
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

// Authentication events
export enum AuthEvent {
  // Session events
  SESSION_CREATE = 'SESSION_CREATE',
  SESSION_LOAD = 'SESSION_LOAD',
  SESSION_UPDATE = 'SESSION_UPDATE',
  SESSION_DELETE = 'SESSION_DELETE',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  
  // Token events
  TOKEN_EXCHANGE = 'TOKEN_EXCHANGE',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  TOKEN_VALIDATION = 'TOKEN_VALIDATION',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  
  // OAuth events
  OAUTH_START = 'OAUTH_START',
  OAUTH_CALLBACK = 'OAUTH_CALLBACK',
  OAUTH_SUCCESS = 'OAUTH_SUCCESS',
  OAUTH_FAILURE = 'OAUTH_FAILURE',
  
  // Webhook events
  WEBHOOK_RECEIVED = 'WEBHOOK_RECEIVED',
  WEBHOOK_VALIDATED = 'WEBHOOK_VALIDATED',
  WEBHOOK_INVALID = 'WEBHOOK_INVALID',
  
  // Security events
  HMAC_VALIDATION = 'HMAC_VALIDATION',
  CSRF_CHECK = 'CSRF_CHECK',
  RATE_LIMIT = 'RATE_LIMIT',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
}

// Metrics storage (in production, use CloudWatch or similar)
interface AuthMetrics {
  tokenExchanges: number;
  tokenRefreshes: number;
  authFailures: number;
  authSuccesses: number;
  avgAuthTime: number;
  webhookValidations: number;
  suspiciousActivities: number;
}

const metrics: AuthMetrics = {
  tokenExchanges: 0,
  tokenRefreshes: 0,
  authFailures: 0,
  authSuccesses: 0,
  avgAuthTime: 0,
  webhookValidations: 0,
  suspiciousActivities: 0,
};

/**
 * Generate a correlation ID for request tracking
 */
export function generateCorrelationId(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Log authentication event with structured data
 */
export function logAuthEvent(
  event: AuthEvent,
  level: LogLevel,
  data: Record<string, any> = {},
  correlationId?: string
): void {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    event,
    correlationId: correlationId || generateCorrelationId(),
    environment: process.env.NODE_ENV || 'development',
    ...data,
  };
  
  // Update metrics based on event
  updateMetrics(event);
  
  // Format and output log
  const logMessage = formatLogMessage(logEntry);
  
  switch (level) {
    case LogLevel.DEBUG:
      if (process.env.NODE_ENV === 'development') {
        console.debug(logMessage);
      }
      break;
    case LogLevel.INFO:
      console.log(logMessage);
      break;
    case LogLevel.WARN:
      console.warn(logMessage);
      break;
    case LogLevel.ERROR:
    case LogLevel.CRITICAL:
      console.error(logMessage);
      break;
  }
  
  // In production, send to monitoring service
  if (process.env.NODE_ENV === 'production') {
    sendToMonitoring(logEntry);
  }
}

/**
 * Format log message for console output
 */
function formatLogMessage(logEntry: any): string {
  const { timestamp, level, event, correlationId, shop, ...rest } = logEntry;
  
  let message = `[${timestamp}] [${level}] [${event}]`;
  
  if (correlationId) {
    message += ` [${correlationId.substring(0, 8)}]`;
  }
  
  if (shop) {
    message += ` [${shop}]`;
  }
  
  // Add relevant details based on event
  if (rest.error) {
    message += ` ERROR: ${rest.error}`;
  }
  
  if (rest.duration) {
    message += ` (${rest.duration}ms)`;
  }
  
  // Add additional data if in development
  if (process.env.NODE_ENV === 'development' && Object.keys(rest).length > 0) {
    message += `\n  Data: ${JSON.stringify(rest, null, 2)}`;
  }
  
  return message;
}

/**
 * Update metrics based on authentication events
 */
function updateMetrics(event: AuthEvent): void {
  switch (event) {
    case AuthEvent.TOKEN_EXCHANGE:
      metrics.tokenExchanges++;
      break;
    case AuthEvent.TOKEN_REFRESH:
      metrics.tokenRefreshes++;
      break;
    case AuthEvent.OAUTH_SUCCESS:
    case AuthEvent.SESSION_CREATE:
      metrics.authSuccesses++;
      break;
    case AuthEvent.OAUTH_FAILURE:
    case AuthEvent.TOKEN_INVALID:
    case AuthEvent.SESSION_EXPIRED:
      metrics.authFailures++;
      break;
    case AuthEvent.WEBHOOK_VALIDATED:
      metrics.webhookValidations++;
      break;
    case AuthEvent.SUSPICIOUS_ACTIVITY:
      metrics.suspiciousActivities++;
      break;
  }
}

/**
 * Send log entry to monitoring service (CloudWatch, DataDog, etc.)
 */
function sendToMonitoring(logEntry: any): void {
  // TODO: Implement integration with monitoring service
  // For now, we'll just track critical events
  if (logEntry.level === LogLevel.CRITICAL || logEntry.level === LogLevel.ERROR) {
    // In production, send to CloudWatch or similar
    // Example: cloudwatch.putLogEvents(...)
  }
}

/**
 * Log authentication timing
 */
export function logAuthTiming(
  operation: string,
  startTime: number,
  success: boolean,
  correlationId?: string
): void {
  const duration = Date.now() - startTime;
  
  // Update average auth time
  const totalTime = metrics.avgAuthTime * (metrics.authSuccesses + metrics.authFailures);
  metrics.avgAuthTime = (totalTime + duration) / (metrics.authSuccesses + metrics.authFailures + 1);
  
  logAuthEvent(
    success ? AuthEvent.SESSION_CREATE : AuthEvent.OAUTH_FAILURE,
    success ? LogLevel.INFO : LogLevel.WARN,
    {
      operation,
      duration,
      success,
    },
    correlationId
  );
}

/**
 * Log suspicious activity
 */
export function logSuspiciousActivity(
  type: string,
  details: Record<string, any>,
  correlationId?: string
): void {
  logAuthEvent(
    AuthEvent.SUSPICIOUS_ACTIVITY,
    LogLevel.WARN,
    {
      type,
      ...details,
      alert: true,
    },
    correlationId
  );
}

/**
 * Get current metrics
 */
export function getMetrics(): AuthMetrics {
  return { ...metrics };
}

/**
 * Reset metrics (useful for testing)
 */
export function resetMetrics(): void {
  metrics.tokenExchanges = 0;
  metrics.tokenRefreshes = 0;
  metrics.authFailures = 0;
  metrics.authSuccesses = 0;
  metrics.avgAuthTime = 0;
  metrics.webhookValidations = 0;
  metrics.suspiciousActivities = 0;
}

/**
 * Middleware helper for Express/Remix to add correlation ID
 */
export function addCorrelationId(request: Request): string {
  const correlationId = request.headers.get('X-Correlation-ID') || generateCorrelationId();
  return correlationId;
}

/**
 * Log session operations with detailed context
 */
export class SessionLogger {
  private correlationId: string;
  
  constructor(correlationId?: string) {
    this.correlationId = correlationId || generateCorrelationId();
  }
  
  logCreate(shop: string, sessionId: string, isOnline: boolean): void {
    logAuthEvent(
      AuthEvent.SESSION_CREATE,
      LogLevel.INFO,
      { shop, sessionId, isOnline },
      this.correlationId
    );
  }
  
  logLoad(sessionId: string, found: boolean): void {
    logAuthEvent(
      found ? AuthEvent.SESSION_LOAD : AuthEvent.SESSION_EXPIRED,
      found ? LogLevel.DEBUG : LogLevel.WARN,
      { sessionId, found },
      this.correlationId
    );
  }
  
  logUpdate(sessionId: string, changes: string[]): void {
    logAuthEvent(
      AuthEvent.SESSION_UPDATE,
      LogLevel.DEBUG,
      { sessionId, changes },
      this.correlationId
    );
  }
  
  logDelete(sessionId: string, success: boolean): void {
    logAuthEvent(
      AuthEvent.SESSION_DELETE,
      success ? LogLevel.INFO : LogLevel.ERROR,
      { sessionId, success },
      this.correlationId
    );
  }
  
  logError(operation: string, error: any): void {
    logAuthEvent(
      AuthEvent.OAUTH_FAILURE,
      LogLevel.ERROR,
      {
        operation,
        error: error.message || error,
        stack: error.stack,
      },
      this.correlationId
    );
  }
}

/**
 * Export metrics for monitoring dashboards
 */
export function exportMetrics(): string {
  const report = {
    timestamp: new Date().toISOString(),
    metrics: getMetrics(),
    health: {
      authFailureRate: metrics.authFailures / (metrics.authSuccesses + metrics.authFailures) || 0,
      avgResponseTime: metrics.avgAuthTime,
      suspiciousActivityCount: metrics.suspiciousActivities,
    },
  };
  
  return JSON.stringify(report, null, 2);
}