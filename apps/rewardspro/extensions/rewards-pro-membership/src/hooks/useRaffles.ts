import { useState, useCallback } from 'react';
import { useApiClient } from './useApiClient';
import { logger } from '../utils/logger';

// ============================================
// TYPES
// ============================================

export interface RaffleInfo {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  status: string;
  entryCost: number;
  maxEntriesPerCustomer: number;
  customerEntries: number;
  canEnter: boolean;
  startsAt: string;
  endsAt: string;
  totalEntries: number;
  uniqueEntrants: number;
}

export interface RaffleEntryResult {
  success: boolean;
  entryId?: string;
  entriesCount?: number;
  totalEntriesCount?: number;
  pointsSpent?: number;
  newBalance?: number;
  message?: string;
  error?: string;
}

export interface RaffleHistoryEntry {
  id: string;
  raffleName: string;
  entriesCount: number;
  pointsSpent: number;
  enteredAt: string;
  raffleStatus: string;
  isWinner: boolean;
  prize?: string;
}

export interface RafflesData {
  enabled: boolean;
  authenticated: boolean;
  raffles: RaffleInfo[];
  pointsBalance: number;
  config: {
    currencyName: string;
    currencyIcon: string;
  };
}

interface UseRafflesProps {
  shopDomain?: string;
}

interface UseRafflesReturn {
  raffles: RaffleInfo[];
  isEnabled: boolean;
  isLoading: boolean;
  error: string | null;
  pointsBalance: number;
  config: { currencyName: string; currencyIcon: string } | null;
  history: RaffleHistoryEntry[];
  historyLoading: boolean;
  fetchRaffles: (sessionToken: string) => Promise<void>;
  fetchHistory: (sessionToken: string) => Promise<void>;
  purchaseEntries: (
    sessionToken: string,
    raffleId: string,
    quantity: number
  ) => Promise<RaffleEntryResult>;
}

// ============================================
// HOOK
// ============================================

export function useRaffles({ shopDomain }: UseRafflesProps): UseRafflesReturn {
  const [raffles, setRaffles] = useState<RaffleInfo[]>([]);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pointsBalance, setPointsBalance] = useState(0);
  const [config, setConfig] = useState<{ currencyName: string; currencyIcon: string } | null>(null);
  const [history, setHistory] = useState<RaffleHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const apiClient = useApiClient({
    baseUrl: '/api/customer-account/raffles',
    shopDomain,
  });

  const fetchRaffles = useCallback(async (sessionToken: string) => {
    logger.debug('useRaffles: Fetching raffles');
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.get<RafflesData>(sessionToken, '');

      if (response.success && response.data) {
        setIsEnabled(response.data.enabled);
        setRaffles(response.data.raffles || []);
        setPointsBalance(response.data.pointsBalance || 0);
        setConfig(response.data.config || null);
      } else {
        setError(response.error || 'Failed to fetch raffles');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('useRaffles: Error fetching raffles:', errorMessage);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [apiClient]);

  const fetchHistory = useCallback(async (sessionToken: string) => {
    logger.debug('useRaffles: Fetching history');
    setHistoryLoading(true);

    try {
      const response = await apiClient.get<{ history: RaffleHistoryEntry[] }>(
        sessionToken,
        '?action=history'
      );

      if (response.success && response.data) {
        setHistory(response.data.history || []);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('useRaffles: Error fetching history:', errorMessage);
    } finally {
      setHistoryLoading(false);
    }
  }, [apiClient]);

  const purchaseEntries = useCallback(async (
    sessionToken: string,
    raffleId: string,
    quantity: number
  ): Promise<RaffleEntryResult> => {
    logger.debug('useRaffles: Purchasing entries', { raffleId, quantity });

    try {
      const response = await apiClient.post<RaffleEntryResult>(sessionToken, '', {
        raffleId,
        quantity,
        intent: 'purchase',
      });

      if (response.success && response.data) {
        // Update local points balance
        if (response.data.newBalance !== undefined) {
          setPointsBalance(response.data.newBalance);
        }

        // Refresh raffles to update entry counts
        await fetchRaffles(sessionToken);

        return response.data;
      }

      return {
        success: false,
        error: response.error || 'Failed to purchase entries',
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('useRaffles: Error purchasing entries:', errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }, [apiClient, fetchRaffles]);

  return {
    raffles,
    isEnabled,
    isLoading,
    error,
    pointsBalance,
    config,
    history,
    historyLoading,
    fetchRaffles,
    fetchHistory,
    purchaseEntries,
  };
}
