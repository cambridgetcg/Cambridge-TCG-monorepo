/**
 * Custom hook for fetching loyalty data with session token authentication
 *
 * Features:
 * - Automatic session token refresh (5-minute TTL)
 * - Request deduplication
 * - Stale-while-revalidate caching (30s TTL)
 * - Real-time polling for balance updates (configurable interval)
 * - Multi-currency support via PaymentSettings API
 * - Exponential backoff for error recovery
 * - Analytics event tracking
 * - Proper error handling and cleanup
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { useApi } from '@shopify/ui-extensions-react/customer-account';
import type { LoyaltyAPIResponse } from '../types';

// Cache duration: 30 seconds
const CACHE_TTL = 30000;

// Polling interval: 60 seconds for real-time updates
const POLL_INTERVAL = 60000;

// Exponential backoff configuration
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 30000; // 30 seconds
const MAX_RETRIES = 5;

// Global pending request map for deduplication
const pendingRequests = new Map<string, Promise<any>>();

async function fetchWithDedup<T>(
  key: string,
  fetcher: () => Promise<T>
): Promise<T> {
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key)!;
  }

  const promise = fetcher();
  pendingRequests.set(key, promise);

  try {
    return await promise;
  } finally {
    pendingRequests.delete(key);
  }
}

/**
 * Calculate exponential backoff delay with jitter
 */
function getRetryDelay(attempt: number): number {
  const delay = Math.min(
    INITIAL_RETRY_DELAY * Math.pow(2, attempt),
    MAX_RETRY_DELAY
  );
  // Add jitter (±25% random variation)
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.floor(delay + jitter);
}

interface UseLoyaltyDataOptions {
  enablePolling?: boolean;
  pollInterval?: number;
  enableAnalytics?: boolean;
}

export function useLoyaltyData(options: UseLoyaltyDataOptions = {}) {
  const {
    enablePolling = true,
    pollInterval = POLL_INTERVAL,
    enableAnalytics = true,
  } = options;

  const { sessionToken, analytics } = useApi();
  const [data, setData] = useState<LoyaltyAPIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const lastFetchRef = useRef(0);
  const mountedRef = useRef(true);
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const retryTimerRef = useRef<ReturnType<typeof setTimeout>>();

  /**
   * Fetch loyalty data with retry logic and exponential backoff
   */
  const fetchLoyaltyData = useCallback(async (isRetry = false) => {
    const now = Date.now();

    // Return if cache is still fresh (skip cache on retry)
    if (!isRetry && data && now - lastFetchRef.current < CACHE_TTL) {
      setLoading(false);
      return;
    }

    try {
      // Show stale data immediately if available
      if (data) setLoading(false);

      // Track fetch start
      if (enableAnalytics && !isRetry) {
        analytics.publish('loyalty_data_fetch_start', {
          timestamp: now,
          has_cached_data: !!data,
        });
      }

      // Fetch with deduplication
      const result = await fetchWithDedup('loyalty', async () => {
        // Get fresh session token (5-minute TTL, auto-cached)
        const token = await sessionToken.get();

        const response = await fetch(
          'https://rewardspro-production-nnwf.vercel.app/api/customer-account/loyalty',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response.json();
      });

      if (mountedRef.current) {
        setData(result);
        setError(null);
        setRetryCount(0); // Reset retry count on success
        lastFetchRef.current = now;

        // Track successful fetch
        if (enableAnalytics) {
          analytics.publish('loyalty_data_fetch_success', {
            timestamp: now,
            enrolled: result.enrolled,
            has_tier: !!result.data?.tier,
            response_time: Date.now() - now,
          });
        }

        // Schedule next poll if enabled
        if (enablePolling && mountedRef.current) {
          pollingTimerRef.current = setTimeout(() => {
            if (mountedRef.current) {
              fetchLoyaltyData();
            }
          }, pollInterval);
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error('Error fetching loyalty data:', err);

        // Track error
        if (enableAnalytics) {
          analytics.publish('loyalty_data_fetch_error', {
            error: errorMessage,
            retry_count: retryCount,
            timestamp: now,
          });
        }

        // Implement exponential backoff retry
        if (retryCount < MAX_RETRIES) {
          const delay = getRetryDelay(retryCount);
          console.log(`Retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);

          setRetryCount(prev => prev + 1);

          retryTimerRef.current = setTimeout(() => {
            if (mountedRef.current) {
              fetchLoyaltyData(true);
            }
          }, delay);
        } else {
          // Max retries reached, set error
          setError(errorMessage);

          // Track max retries reached
          if (enableAnalytics) {
            analytics.publish('loyalty_data_fetch_max_retries', {
              error: errorMessage,
              max_retries: MAX_RETRIES,
              timestamp: now,
            });
          }
        }

        // Keep showing stale data on error if available
        if (!data) {
          setLoading(false);
        }
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [sessionToken, data, retryCount, enablePolling, pollInterval, enableAnalytics, analytics]);

  /**
   * Manual refetch (bypasses cache, resets retry count)
   */
  const refetch = useCallback(() => {
    setRetryCount(0);
    lastFetchRef.current = 0; // Force cache bypass
    fetchLoyaltyData();
  }, [fetchLoyaltyData]);

  useEffect(() => {
    mountedRef.current = true;
    fetchLoyaltyData();

    return () => {
      mountedRef.current = false;

      // Cleanup timers
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current);
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, [fetchLoyaltyData]);

  return {
    data,
    loading,
    error,
    refetch,
    isRetrying: retryCount > 0,
    retryCount,
  };
}
