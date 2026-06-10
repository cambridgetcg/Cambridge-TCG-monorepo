/**
 * Logger Utilities Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import {
  Logger,
  createLogger,
  parseLogLevel,
  formatDuration,
} from '../lib/logger.js';

// ============================================================================
// Logger
// ============================================================================

describe('Logger', () => {
  let stdoutSpy: MockInstance<typeof process.stdout.write>;
  let stderrSpy: MockInstance<typeof process.stderr.write>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  describe('log levels', () => {
    it('respects minimum log level', () => {
      const logger = new Logger({ minLevel: 'warn', json: true });

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      // debug and info should not be logged
      expect(stdoutSpy).toHaveBeenCalledTimes(1);
      expect(stderrSpy).toHaveBeenCalledTimes(1);
    });

    it('logs all levels when minLevel is debug', () => {
      const logger = new Logger({ minLevel: 'debug', json: true });

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(stdoutSpy).toHaveBeenCalledTimes(3); // debug, info, warn
      expect(stderrSpy).toHaveBeenCalledTimes(1); // error
    });
  });

  describe('JSON output', () => {
    it('outputs valid JSON', () => {
      const logger = new Logger({ json: true });
      logger.info('test message', { shop: 'test.myshopify.com' });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.level).toBe('info');
      expect(parsed.message).toBe('test message');
      expect(parsed.shop).toBe('test.myshopify.com');
      expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('includes nested context', () => {
      const logger = new Logger({ json: true });
      logger.info('test', {
        component: 'WebhookSimulator',
        durationMs: 100,
      });

      const output = stdoutSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.component).toBe('WebhookSimulator');
      expect(parsed.durationMs).toBe(100);
    });
  });

  describe('child logger', () => {
    it('inherits parent context', () => {
      const parent = new Logger({ json: true, defaultContext: { app: 'tools' } });
      const child = parent.child({ component: 'Inspector' });

      child.info('test message');

      const output = stdoutSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.app).toBe('tools');
      expect(parsed.component).toBe('Inspector');
    });
  });

  describe('exception logging', () => {
    it('includes error details', () => {
      const logger = new Logger({ json: true });
      const error = new Error('Something went wrong');

      logger.exception('Operation failed', error);

      const output = stderrSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.level).toBe('error');
      expect(parsed.message).toBe('Operation failed');
      expect(parsed.error.name).toBe('Error');
      expect(parsed.error.message).toBe('Something went wrong');
      expect(parsed.error.stack).toContain('Error: Something went wrong');
    });
  });

  describe('timed logging', () => {
    it('measures sync function duration', () => {
      const logger = new Logger({ json: true });
      const result = logger.timed('Sync operation', () => 'result');

      expect(result).toBe('result');

      const output = stdoutSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.message).toBe('Sync operation completed');
      expect(typeof parsed.durationMs).toBe('number');
    });

    it('measures async function duration', async () => {
      const logger = new Logger({ json: true });
      const result = await logger.timed('Async operation', async () => {
        await new Promise((r) => setTimeout(r, 10));
        return 'async result';
      });

      expect(result).toBe('async result');

      const output = stdoutSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.message).toBe('Async operation completed');
      expect(parsed.durationMs).toBeGreaterThanOrEqual(10);
    });

    it('logs failure for throwing function', () => {
      const logger = new Logger({ json: true });

      expect(() =>
        logger.timed('Failing operation', () => {
          throw new Error('fail');
        })
      ).toThrow('fail');

      const output = stderrSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.message).toBe('Failing operation failed');
      expect(parsed.level).toBe('error');
    });
  });
});

// ============================================================================
// createLogger
// ============================================================================

describe('createLogger', () => {
  it('creates logger with defaults', () => {
    const logger = createLogger();
    expect(logger).toBeInstanceOf(Logger);
  });

  it('creates logger with custom config', () => {
    const logger = createLogger({ minLevel: 'error' });
    expect(logger).toBeInstanceOf(Logger);
  });
});

// ============================================================================
// parseLogLevel
// ============================================================================

describe('parseLogLevel', () => {
  it('parses valid levels', () => {
    expect(parseLogLevel('debug')).toBe('debug');
    expect(parseLogLevel('info')).toBe('info');
    expect(parseLogLevel('warn')).toBe('warn');
    expect(parseLogLevel('error')).toBe('error');
  });

  it('handles case insensitively', () => {
    expect(parseLogLevel('DEBUG')).toBe('debug');
    expect(parseLogLevel('Info')).toBe('info');
  });

  it('returns info for invalid/undefined', () => {
    expect(parseLogLevel(undefined)).toBe('info');
    expect(parseLogLevel('invalid')).toBe('info');
    expect(parseLogLevel('')).toBe('info');
  });
});

// ============================================================================
// formatDuration
// ============================================================================

describe('formatDuration', () => {
  it('formats milliseconds', () => {
    expect(formatDuration(100)).toBe('100ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('formats seconds', () => {
    expect(formatDuration(1000)).toBe('1.0s');
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(59999)).toBe('60.0s');
  });

  it('formats minutes', () => {
    expect(formatDuration(60000)).toBe('1.0m');
    expect(formatDuration(90000)).toBe('1.5m');
  });
});
