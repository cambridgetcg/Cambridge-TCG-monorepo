/**
 * API Rate Limiter for AWS Lambda
 *
 * Leaky bucket implementation using DynamoDB for distributed state.
 * Designed for Lambda functions that call external APIs (SendGrid, Klaviyo).
 *
 * Features:
 * - Token bucket algorithm with configurable rates
 * - DynamoDB for cross-Lambda coordination
 * - In-memory fallback for resilience
 * - 429 response handling with Retry-After parsing
 */

const {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} = require("@aws-sdk/client-dynamodb");

// =============================================================================
// Configuration
// =============================================================================

const RATE_LIMITS = {
  sendgrid: {
    bucketSize: 100, // Burst capacity
    refillRate: 10, // 600/minute = 10/second
    minIntervalMs: 50, // 50ms between requests
  },
  klaviyo: {
    bucketSize: 75, // Burst capacity
    refillRate: 10, // ~600/minute sustained
    minIntervalMs: 50, // 50ms between requests
  },
};

// DynamoDB table for rate limit state
const RATE_LIMIT_TABLE = process.env.DYNAMODB_RATE_LIMIT_TABLE || "rewardspro-rate-limits";

// DynamoDB client
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "eu-north-1",
});

// In-memory fallback
const inMemoryState = new Map();
let useFallback = false;

// =============================================================================
// Rate Limiter Class
// =============================================================================

class LambdaRateLimiter {
  constructor(apiName, shop = "global") {
    this.apiName = apiName;
    this.shop = shop;
    this.config = RATE_LIMITS[apiName];
    this.stateKey = `${apiName}:${shop}`;

    if (!this.config) {
      throw new Error(`Unknown API: ${apiName}. Valid options: ${Object.keys(RATE_LIMITS).join(", ")}`);
    }
  }

  /**
   * Try to acquire tokens from the bucket
   * @param {number} cost - Number of tokens to acquire (default: 1)
   * @returns {Promise<{allowed: boolean, waitMs?: number, retryAfterMs?: number}>}
   */
  async acquire(cost = 1) {
    try {
      return await this._acquireFromDynamoDB(cost);
    } catch (error) {
      console.warn(`[RateLimiter] DynamoDB error, using fallback:`, error.message);
      useFallback = true;
      return this._acquireFromMemory(cost);
    }
  }

  /**
   * Wait until tokens are available, then acquire
   * @param {number} cost - Number of tokens needed
   * @param {number} maxWaitMs - Maximum time to wait (default: 30s)
   * @returns {Promise<boolean>} - True if acquired, false if timeout
   */
  async waitAndAcquire(cost = 1, maxWaitMs = 30000) {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const result = await this.acquire(cost);

      if (result.allowed) {
        // Wait for minimum interval if needed
        if (result.waitMs > 0) {
          await this._sleep(result.waitMs);
        }
        return true;
      }

      // Wait for retry time
      const waitTime = Math.min(
        result.retryAfterMs || 1000,
        maxWaitMs - (Date.now() - startTime)
      );

      if (waitTime > 0) {
        await this._sleep(waitTime);
      }
    }

    return false;
  }

  /**
   * Handle a 429 response from the API
   * @param {Response} response - The HTTP response
   * @returns {number} - Milliseconds to wait before retry
   */
  handleRateLimitResponse(response) {
    const retryAfter = response.headers?.get?.("Retry-After");

    if (retryAfter) {
      // Retry-After can be seconds or a date
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) {
        return seconds * 1000;
      }
      // It's a date - parse it
      const date = new Date(retryAfter);
      return Math.max(0, date.getTime() - Date.now());
    }

    // Default: exponential backoff starting at 1s
    return 1000;
  }

  /**
   * Release tokens back to the bucket (for failed requests)
   * @param {number} cost - Tokens to release
   */
  async release(cost = 1) {
    try {
      const state = await this._getState();
      state.tokens = Math.min(state.tokens + cost, this.config.bucketSize);
      await this._setState(state);
    } catch (error) {
      console.warn(`[RateLimiter] Failed to release tokens:`, error.message);
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  async _acquireFromDynamoDB(cost) {
    const now = Date.now();
    const state = await this._getState();

    // Refill tokens based on elapsed time
    const elapsedSeconds = (now - state.lastRefill) / 1000;
    const refilled = elapsedSeconds * this.config.refillRate;
    state.tokens = Math.min(state.tokens + refilled, this.config.bucketSize);
    state.lastRefill = now;

    // Check minimum interval
    const timeSinceLastRequest = now - state.lastRequest;
    if (timeSinceLastRequest < this.config.minIntervalMs) {
      const waitMs = this.config.minIntervalMs - timeSinceLastRequest;
      return { allowed: true, waitMs };
    }

    // Check if enough tokens
    if (state.tokens >= cost) {
      state.tokens -= cost;
      state.lastRequest = now;
      await this._setState(state);
      return { allowed: true, waitMs: 0 };
    }

    // Not enough tokens - calculate retry time
    const tokensNeeded = cost - state.tokens;
    const retryAfterMs = Math.ceil((tokensNeeded / this.config.refillRate) * 1000);

    return { allowed: false, retryAfterMs };
  }

  _acquireFromMemory(cost) {
    const now = Date.now();
    let state = inMemoryState.get(this.stateKey);

    if (!state) {
      state = {
        tokens: this.config.bucketSize,
        lastRefill: now,
        lastRequest: 0,
      };
    }

    // Refill tokens
    const elapsedSeconds = (now - state.lastRefill) / 1000;
    const refilled = elapsedSeconds * this.config.refillRate;
    state.tokens = Math.min(state.tokens + refilled, this.config.bucketSize);
    state.lastRefill = now;

    // Check minimum interval
    const timeSinceLastRequest = now - state.lastRequest;
    if (timeSinceLastRequest < this.config.minIntervalMs) {
      return { allowed: true, waitMs: this.config.minIntervalMs - timeSinceLastRequest };
    }

    if (state.tokens >= cost) {
      state.tokens -= cost;
      state.lastRequest = now;
      inMemoryState.set(this.stateKey, state);
      return { allowed: true, waitMs: 0 };
    }

    const tokensNeeded = cost - state.tokens;
    const retryAfterMs = Math.ceil((tokensNeeded / this.config.refillRate) * 1000);

    return { allowed: false, retryAfterMs };
  }

  async _getState() {
    if (useFallback) {
      return (
        inMemoryState.get(this.stateKey) || {
          tokens: this.config.bucketSize,
          lastRefill: Date.now(),
          lastRequest: 0,
        }
      );
    }

    try {
      const result = await dynamoClient.send(
        new GetItemCommand({
          TableName: RATE_LIMIT_TABLE,
          Key: {
            pk: { S: this.stateKey },
          },
        })
      );

      if (result.Item) {
        return {
          tokens: parseFloat(result.Item.tokens?.N || this.config.bucketSize),
          lastRefill: parseInt(result.Item.lastRefill?.N || Date.now(), 10),
          lastRequest: parseInt(result.Item.lastRequest?.N || 0, 10),
        };
      }
    } catch (error) {
      console.warn(`[RateLimiter] DynamoDB get failed:`, error.message);
    }

    return {
      tokens: this.config.bucketSize,
      lastRefill: Date.now(),
      lastRequest: 0,
    };
  }

  async _setState(state) {
    if (useFallback) {
      inMemoryState.set(this.stateKey, state);
      return;
    }

    try {
      await dynamoClient.send(
        new PutItemCommand({
          TableName: RATE_LIMIT_TABLE,
          Item: {
            pk: { S: this.stateKey },
            tokens: { N: state.tokens.toString() },
            lastRefill: { N: state.lastRefill.toString() },
            lastRequest: { N: state.lastRequest.toString() },
            ttl: { N: Math.floor((Date.now() + 3600000) / 1000).toString() }, // 1 hour TTL
          },
        })
      );
    } catch (error) {
      console.warn(`[RateLimiter] DynamoDB put failed:`, error.message);
      inMemoryState.set(this.stateKey, state);
    }
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a SendGrid rate limiter
 * @param {string} shop - Shop identifier (optional, defaults to "global")
 */
function createSendGridRateLimiter(shop = "global") {
  return new LambdaRateLimiter("sendgrid", shop);
}

/**
 * Create a Klaviyo rate limiter
 * @param {string} shop - Shop identifier
 */
function createKlaviyoRateLimiter(shop) {
  return new LambdaRateLimiter("klaviyo", shop);
}

// =============================================================================
// Utility: Wrap API call with rate limiting
// =============================================================================

/**
 * Execute an API call with rate limiting
 *
 * @param {LambdaRateLimiter} rateLimiter - Rate limiter instance
 * @param {Function} apiCall - Async function that makes the API call
 * @param {Object} options - Options
 * @param {number} options.cost - Token cost (default: 1)
 * @param {number} options.maxRetries - Max retries on 429 (default: 3)
 * @param {number} options.maxWaitMs - Max wait for rate limit (default: 30000)
 * @returns {Promise<Response>} - API response
 */
async function withRateLimit(rateLimiter, apiCall, options = {}) {
  const { cost = 1, maxRetries = 3, maxWaitMs = 30000 } = options;

  // Acquire rate limit token
  const acquired = await rateLimiter.waitAndAcquire(cost, maxWaitMs);
  if (!acquired) {
    throw new Error("Rate limit timeout - could not acquire token");
  }

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await apiCall();

      // Handle 429 response
      if (response.status === 429) {
        const waitMs = rateLimiter.handleRateLimitResponse(response);
        console.warn(
          `[RateLimiter] 429 response, attempt ${attempt + 1}/${maxRetries + 1}, waiting ${waitMs}ms`
        );

        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        throw new Error(`API rate limited after ${maxRetries + 1} attempts`);
      }

      return response;
    } catch (error) {
      lastError = error;

      // Network errors - release token and retry
      if (error.message?.includes("network") || error.message?.includes("ECONNRESET")) {
        await rateLimiter.release(cost);

        if (attempt < maxRetries) {
          const waitMs = 1000 * Math.pow(2, attempt);
          console.warn(`[RateLimiter] Network error, retrying in ${waitMs}ms`);
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
      }

      throw error;
    }
  }

  throw lastError || new Error("API request failed");
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  LambdaRateLimiter,
  createSendGridRateLimiter,
  createKlaviyoRateLimiter,
  withRateLimit,
  RATE_LIMITS,
};
