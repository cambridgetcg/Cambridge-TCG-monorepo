import { useState, useCallback } from 'react';
import { useApiClient } from './useApiClient';
import { logger } from '../utils/logger';

// ============================================
// TYPES
// ============================================

export interface MysteryBoxInfo {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  status: string;
  openCost: number;
  customerOpens: number;
  maxOpensPerCustomer: number;
  canOpen: boolean;
  reason?: string;
  opensRemaining: number;
  startsAt: string;
  endsAt: string;
  totalOpens: number;
  uniqueOpeners: number;
}

export interface MysteryBoxReward {
  name: string;
  type: string;
  value: Record<string, unknown>;
  rarity: string;
}

export interface OpenBoxResult {
  success: boolean;
  openId?: string;
  winnerId?: string;
  reward?: MysteryBoxReward;
  pointsSpent?: number;
  newBalance?: number;
  message?: string;
  error?: string;
}

export interface MysteryBoxesData {
  enabled: boolean;
  authenticated: boolean;
  boxes: MysteryBoxInfo[];
  pointsBalance: number;
  config: {
    currencyName: string;
    currencyIcon: string;
  };
}

interface UseMysteryBoxesProps {
  shopDomain?: string;
}

interface UseMysteryBoxesReturn {
  boxes: MysteryBoxInfo[];
  isEnabled: boolean;
  isLoading: boolean;
  error: string | null;
  pointsBalance: number;
  config: { currencyName: string; currencyIcon: string } | null;
  fetchBoxes: (sessionToken: string) => Promise<void>;
  openBox: (sessionToken: string, boxId: string) => Promise<OpenBoxResult>;
}

// ============================================
// HOOK
// ============================================

export function useMysteryBoxes({ shopDomain }: UseMysteryBoxesProps): UseMysteryBoxesReturn {
  const [boxes, setBoxes] = useState<MysteryBoxInfo[]>([]);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pointsBalance, setPointsBalance] = useState(0);
  const [config, setConfig] = useState<{ currencyName: string; currencyIcon: string } | null>(null);

  const apiClient = useApiClient({
    baseUrl: '/api/customer-account/mystery-boxes',
    shopDomain,
  });

  const fetchBoxes = useCallback(async (sessionToken: string) => {
    logger.debug('useMysteryBoxes: Fetching boxes');
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.get<MysteryBoxesData>(sessionToken, '');

      if (response.success && response.data) {
        setIsEnabled(response.data.enabled);
        setBoxes(response.data.boxes || []);
        setPointsBalance(response.data.pointsBalance || 0);
        setConfig(response.data.config || null);
      } else {
        setError(response.error || 'Failed to fetch mystery boxes');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('useMysteryBoxes: Error fetching boxes:', errorMessage);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [apiClient]);

  const openBox = useCallback(async (
    sessionToken: string,
    boxId: string
  ): Promise<OpenBoxResult> => {
    logger.debug('useMysteryBoxes: Opening box', { boxId });

    try {
      const response = await apiClient.post<OpenBoxResult>(sessionToken, '', {
        boxId,
        intent: 'open',
      });

      if (response.success && response.data) {
        // Update local points balance
        if (response.data.newBalance !== undefined) {
          setPointsBalance(response.data.newBalance);
        }

        // Refresh boxes to update open counts
        await fetchBoxes(sessionToken);

        return response.data;
      }

      return {
        success: false,
        error: response.error || 'Failed to open box',
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('useMysteryBoxes: Error opening box:', errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }, [apiClient, fetchBoxes]);

  return {
    boxes,
    isEnabled,
    isLoading,
    error,
    pointsBalance,
    config,
    fetchBoxes,
    openBox,
  };
}
