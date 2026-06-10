/**
 * Retry Utilities Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withRetry,
  withRetryThrow,
  withTimeout,
  sleep,
  isNetworkError,
  isRetryableStatusCode,
  createHttpRetryPredicate,
  TimeoutError,
} from '../lib/retry.js';

// ============================================================================
// withRetry
// ============================================================================

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('succeeds on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const resultPromise = withRetry(fn);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.result).toBe('success');
    expect(result.attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const resultPromise = withRetry(fn, { maxAttempts: 3, initialDelayMs: 100, jitter: false });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.result).toBe('success');
    expect(result.attempts).toBe(3);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('fails after max attempts', async () => {
    const error = new Error('persistent error');
    const fn = vi.fn().mockRejectedValue(error);

    const resultPromise = withRetry(fn, { maxAttempts: 3, initialDelayMs: 100, jitter: false });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.error).toBe(error);
    expect(result.attempts).toBe(3);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('respects isRetryable predicate', async () => {
    const retryableError = new Error('network error');
    const nonRetryableError = new Error('validation error');
    const fn = vi.fn().mockRejectedValue(nonRetryableError);

    const isRetryable = (err: Error) => err.message.includes('network');

    const resultPromise = withRetry(fn, {
      maxAttempts: 3,
      initialDelayMs: 100,
      jitter: false,
      isRetryable,
    });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1); // No retries for non-retryable errors
  });

  it('calls onRetry callback', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    const onRetry = vi.fn();

    const resultPromise = withRetry(fn, {
      maxAttempts: 3,
      initialDelayMs: 100,
      jitter: false,
      onRetry,
    });
    await vi.runAllTimersAsync();
    await resultPromise;

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, expect.any(Number));
  });

  it('applies exponential backoff', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const delays: number[] = [];
    const onRetry = (_err: Error, _attempt: number, delayMs: number) => {
      delays.push(delayMs);
    };

    const resultPromise = withRetry(fn, {
      maxAttempts: 3,
      initialDelayMs: 100,
      backoffMultiplier: 2,
      jitter: false,
      onRetry,
    });
    await vi.runAllTimersAsync();
    await resultPromise;

    expect(delays[0]).toBe(100); // Initial delay
    expect(delays[1]).toBe(200); // 100 * 2^1
  });

  it('respects maxDelayMs', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const delays: number[] = [];
    const onRetry = (_err: Error, _attempt: number, delayMs: number) => {
      delays.push(delayMs);
    };

    const resultPromise = withRetry(fn, {
      maxAttempts: 3,
      initialDelayMs: 100,
      maxDelayMs: 150,
      backoffMultiplier: 2,
      jitter: false,
      onRetry,
    });
    await vi.runAllTimersAsync();
    await resultPromise;

    expect(delays[0]).toBe(100);
    expect(delays[1]).toBe(150); // Capped at maxDelayMs
  });

  it('tracks total duration', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    vi.useRealTimers();
    const result = await withRetry(fn);

    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// withRetryThrow
// ============================================================================

describe('withRetryThrow', () => {
  it('returns result on success', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetryThrow(fn, { maxAttempts: 1 });
    expect(result).toBe('success');
  });

  it('throws on failure', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    await expect(withRetryThrow(fn, { maxAttempts: 1 })).rejects.toThrow('fail');
  });

  it('attaches attempts to error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    try {
      await withRetryThrow(fn, { maxAttempts: 3, initialDelayMs: 1, jitter: false });
    } catch (error: any) {
      expect(error.attempts).toBe(3);
      expect(error.totalDurationMs).toBeGreaterThanOrEqual(0);
    }
  });
});

// ============================================================================
// withTimeout
// ============================================================================

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves if promise completes before timeout', async () => {
    const promise = Promise.resolve('success');
    const resultPromise = withTimeout(promise, 1000);
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    expect(result).toBe('success');
  });

  it('throws TimeoutError if promise exceeds timeout', async () => {
    vi.useRealTimers(); // Use real timers for this test to avoid unhandled rejection issues

    const promise = new Promise((resolve) => {
      setTimeout(() => resolve('too late'), 200);
    });

    const resultPromise = withTimeout(promise, 50);

    await expect(resultPromise).rejects.toThrow(TimeoutError);
    await expect(resultPromise).rejects.toThrow('Operation timed out after 50ms');
  });
});

// ============================================================================
// sleep
// ============================================================================

describe('sleep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves after specified time', async () => {
    const callback = vi.fn();
    const promise = sleep(100).then(callback);

    expect(callback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    await promise;
    expect(callback).toHaveBeenCalled();
  });
});

// ============================================================================
// isNetworkError
// ============================================================================

describe('isNetworkError', () => {
  it('detects network error patterns', () => {
    expect(isNetworkError(new Error('ECONNREFUSED'))).toBe(true);
    expect(isNetworkError(new Error('ECONNRESET'))).toBe(true);
    expect(isNetworkError(new Error('ETIMEDOUT'))).toBe(true);
    expect(isNetworkError(new Error('ENOTFOUND'))).toBe(true);
    expect(isNetworkError(new Error('socket hang up'))).toBe(true);
    expect(isNetworkError(new Error('network error'))).toBe(true);
    expect(isNetworkError(new Error('fetch failed'))).toBe(true);
  });

  it('returns false for non-network errors', () => {
    expect(isNetworkError(new Error('validation failed'))).toBe(false);
    expect(isNetworkError(new Error('not found'))).toBe(false);
    expect(isNetworkError(new Error('unauthorized'))).toBe(false);
  });
});

// ============================================================================
// isRetryableStatusCode
// ============================================================================

describe('isRetryableStatusCode', () => {
  it('retries 5xx errors', () => {
    expect(isRetryableStatusCode(500)).toBe(true);
    expect(isRetryableStatusCode(502)).toBe(true);
    expect(isRetryableStatusCode(503)).toBe(true);
    expect(isRetryableStatusCode(504)).toBe(true);
  });

  it('retries 429 rate limiting', () => {
    expect(isRetryableStatusCode(429)).toBe(true);
  });

  it('does not retry 4xx client errors', () => {
    expect(isRetryableStatusCode(400)).toBe(false);
    expect(isRetryableStatusCode(401)).toBe(false);
    expect(isRetryableStatusCode(403)).toBe(false);
    expect(isRetryableStatusCode(404)).toBe(false);
  });

  it('does not retry success codes', () => {
    expect(isRetryableStatusCode(200)).toBe(false);
    expect(isRetryableStatusCode(201)).toBe(false);
    expect(isRetryableStatusCode(204)).toBe(false);
  });
});

// ============================================================================
// createHttpRetryPredicate
// ============================================================================

describe('createHttpRetryPredicate', () => {
  const predicate = createHttpRetryPredicate();

  it('retries network errors', () => {
    expect(predicate(new Error('ECONNREFUSED'))).toBe(true);
    expect(predicate(new Error('socket hang up'))).toBe(true);
  });

  it('retries 5xx status codes in error message', () => {
    expect(predicate(new Error('Request failed with status: 500'))).toBe(true);
    expect(predicate(new Error('status 503'))).toBe(true);
  });

  it('retries 429 rate limiting', () => {
    expect(predicate(new Error('status: 429'))).toBe(true);
  });

  it('retries timeout errors', () => {
    expect(predicate(new TimeoutError('timeout'))).toBe(true);
    const error = new Error('timeout');
    error.name = 'TimeoutError';
    expect(predicate(error)).toBe(true);
  });

  it('does not retry client errors', () => {
    expect(predicate(new Error('status: 400'))).toBe(false);
    expect(predicate(new Error('status: 404'))).toBe(false);
  });

  it('does not retry unknown errors by default', () => {
    expect(predicate(new Error('unknown error'))).toBe(false);
  });
});

// ============================================================================
// TimeoutError
// ============================================================================

describe('TimeoutError', () => {
  it('has correct name and message', () => {
    const error = new TimeoutError('test timeout');
    expect(error.name).toBe('TimeoutError');
    expect(error.message).toBe('test timeout');
    expect(error instanceof Error).toBe(true);
  });
});
