/**
 * Structured Logging Utility
 *
 * Provides consistent logging across all tools with:
 * - JSON output for production/machine consumption
 * - Colorful console output for development
 * - Configurable log levels
 * - Contextual metadata support
 */

// ============================================================================
// Types
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  /** Component or module name */
  component?: string;
  /** Operation being performed */
  operation?: string;
  /** Shop domain for multi-tenant context */
  shop?: string;
  /** Request/correlation ID for tracing */
  requestId?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Additional structured data */
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
}

export interface LoggerConfig {
  /** Minimum level to log (default: 'info') */
  minLevel?: LogLevel;
  /** Output JSON format (default: false in TTY, true otherwise) */
  json?: boolean;
  /** Include timestamps (default: true) */
  timestamps?: boolean;
  /** Default context added to all logs */
  defaultContext?: LogContext;
}

// ============================================================================
// Constants
// ============================================================================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ANSI color codes for terminal output
const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  // Foreground
  gray: '\x1b[90m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: COLORS.gray,
  info: COLORS.blue,
  warn: COLORS.yellow,
  error: COLORS.red,
};

const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO ',
  warn: 'WARN ',
  error: 'ERROR',
};

// ============================================================================
// Logger Implementation
// ============================================================================

export class Logger {
  private minLevel: number;
  private json: boolean;
  private timestamps: boolean;
  private defaultContext: LogContext;

  constructor(config: LoggerConfig = {}) {
    this.minLevel = LOG_LEVELS[config.minLevel || 'info'];
    this.json = config.json ?? !process.stdout.isTTY;
    this.timestamps = config.timestamps ?? true;
    this.defaultContext = config.defaultContext || {};
  }

  /**
   * Create a child logger with additional default context
   */
  child(context: LogContext): Logger {
    return new Logger({
      minLevel: Object.keys(LOG_LEVELS).find(
        (k) => LOG_LEVELS[k as LogLevel] === this.minLevel
      ) as LogLevel,
      json: this.json,
      timestamps: this.timestamps,
      defaultContext: { ...this.defaultContext, ...context },
    });
  }

  /**
   * Log at debug level
   */
  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  /**
   * Log at info level
   */
  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  /**
   * Log at warn level
   */
  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  /**
   * Log at error level
   */
  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  /**
   * Log an error with stack trace
   */
  exception(message: string, error: Error, context?: LogContext): void {
    this.log('error', message, {
      ...context,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    });
  }

  /**
   * Log with timing measurement
   */
  timed<T>(
    message: string,
    fn: () => T | Promise<T>,
    context?: LogContext
  ): T extends Promise<infer U> ? Promise<U> : T {
    const startTime = Date.now();

    const logCompletion = (success: boolean) => {
      const durationMs = Date.now() - startTime;
      const level = success ? 'info' : 'error';
      this.log(level, `${message} ${success ? 'completed' : 'failed'}`, {
        ...context,
        durationMs,
      });
    };

    try {
      const result = fn();

      if (result instanceof Promise) {
        return result
          .then((value) => {
            logCompletion(true);
            return value;
          })
          .catch((error) => {
            logCompletion(false);
            throw error;
          }) as any;
      }

      logCompletion(true);
      return result as any;
    } catch (error) {
      logCompletion(false);
      throw error;
    }
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (LOG_LEVELS[level] < this.minLevel) {
      return;
    }

    const mergedContext = { ...this.defaultContext, ...context };
    const timestamp = new Date().toISOString();

    if (this.json) {
      this.outputJson({ timestamp, level, message, context: mergedContext });
    } else {
      this.outputPretty({ timestamp, level, message, context: mergedContext });
    }
  }

  /**
   * Output JSON format for machine consumption
   */
  private outputJson(entry: LogEntry): void {
    const output = {
      timestamp: entry.timestamp,
      level: entry.level,
      message: entry.message,
      ...(entry.context && Object.keys(entry.context).length > 0
        ? entry.context
        : {}),
    };

    const stream = entry.level === 'error' ? process.stderr : process.stdout;
    stream.write(JSON.stringify(output) + '\n');
  }

  /**
   * Output colorful format for development
   */
  private outputPretty(entry: LogEntry): void {
    const parts: string[] = [];

    // Timestamp
    if (this.timestamps) {
      const time = entry.timestamp.split('T')[1].replace('Z', '');
      parts.push(`${COLORS.dim}${time}${COLORS.reset}`);
    }

    // Level badge
    const levelColor = LEVEL_COLORS[entry.level];
    parts.push(`${levelColor}${LEVEL_LABELS[entry.level]}${COLORS.reset}`);

    // Component prefix
    if (entry.context?.component) {
      parts.push(`${COLORS.cyan}[${entry.context.component}]${COLORS.reset}`);
    }

    // Message
    parts.push(entry.message);

    // Duration if present
    if (entry.context?.durationMs !== undefined) {
      parts.push(`${COLORS.dim}(${entry.context.durationMs}ms)${COLORS.reset}`);
    }

    // Additional context (excluding reserved keys)
    const extraContext = { ...entry.context };
    delete extraContext.component;
    delete extraContext.operation;
    delete extraContext.durationMs;

    if (Object.keys(extraContext).length > 0) {
      const contextStr = Object.entries(extraContext)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(' ');
      parts.push(`${COLORS.dim}${contextStr}${COLORS.reset}`);
    }

    const stream = entry.level === 'error' ? process.stderr : process.stdout;
    stream.write(parts.join(' ') + '\n');
  }
}

// ============================================================================
// Default Instance
// ============================================================================

/**
 * Create a logger instance with the given configuration
 */
export function createLogger(config?: LoggerConfig): Logger {
  return new Logger(config);
}

/**
 * Default logger instance for quick usage
 */
export const logger = createLogger({
  minLevel: (process.env.LOG_LEVEL as LogLevel) || 'info',
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Parse log level from string (for environment variable support)
 */
export function parseLogLevel(level: string | undefined): LogLevel {
  if (!level) return 'info';
  const normalized = level.toLowerCase();
  if (normalized in LOG_LEVELS) {
    return normalized as LogLevel;
  }
  return 'info';
}

/**
 * Format a duration for display
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
