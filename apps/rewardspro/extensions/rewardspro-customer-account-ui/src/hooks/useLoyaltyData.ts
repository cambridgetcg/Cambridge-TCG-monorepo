/**
 * Custom hook for fetching loyalty data with session token authentication
 *
 * Features:
 * - Automatic session token refresh (5-minute TTL)
 * - Request deduplication
 * - Stale-while-revalidate caching (30s TTL)
 * - Proper error handling and cleanup
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { useApi } from '@shopify/ui-extensions-react/customer-account';
import type { LoyaltyAPIResponse } from '../types';

// Cache duration: 30 seconds
const CACHE_TTL = 30000;

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

export function useLoyaltyData() {
  const { sessionToken } = useApi();
  const [data, setData] = useState<LoyaltyAPIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastFetchRef = useRef(0);
  const mountedRef = useRef(true);

  const fetchLoyaltyData = useCallback(async () => {
    const now = Date.now();

    // Return if cache is still fresh
    if (data && now - lastFetchRef.current < CACHE_TTL) {
      setLoading(false);
      return;
    }

    try {
      // Show stale data immediately if available
      if (data) setLoading(false);

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
        lastFetchRef.current = now;
      }
    } catch (err) {
      if (mountedRef.current) {
        console.error('Error fetching loyalty data:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');

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
  }, [sessionToken, data]);

  useEffect(() => {
    mountedRef.current = true;
    fetchLoyaltyData();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchLoyaltyData]);

  return {
    data,
    loading,
    error,
    refetch: fetchLoyaltyData // Expose refetch for manual refresh
  };
}
