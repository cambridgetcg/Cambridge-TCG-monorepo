import { useState, useCallback } from 'react';
import { useApiClient } from './useApiClient';
import { logger } from '../utils/logger';

// ============================================
// TYPES
// ============================================

export interface ChallengeReward {
  type: 'POINTS' | 'STORE_CREDIT' | 'DISCOUNT' | 'TIER_UPGRADE';
  value: number;
  description: string;
}

export interface ChallengeInfo {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  objectiveType: 'SPENDING' | 'ORDER_COUNT' | 'REFERRAL' | 'PRODUCT_PURCHASE' | 'REVIEW' | 'STREAK';
  targetValue: number;
  currentProgress: number;
  progressPercent: number;
  reward: ChallengeReward;
  startsAt: string;
  endsAt: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CLAIMED' | 'EXPIRED';
}

export interface ClaimChallengeResult {
  success: boolean;
  rewardType?: string;
  rewardValue?: number;
  newBalance?: number;
  message?: string;
  error?: string;
}

export interface ChallengesData {
  enabled: boolean;
  authenticated: boolean;
  challenges: ChallengeInfo[];
  pointsBalance: number;
  config: {
    currencyName: string;
    currencyIcon: string;
  };
  message?: string;
}

interface UseChallengesProps {
  shopDomain?: string;
}

interface UseChallengesReturn {
  challenges: ChallengeInfo[];
  isEnabled: boolean;
  isLoading: boolean;
  error: string | null;
  pointsBalance: number;
  config: { currencyName: string; currencyIcon: string } | null;
  message: string | null;
  fetchChallenges: (sessionToken: string) => Promise<void>;
  claimReward: (sessionToken: string, challengeId: string) => Promise<ClaimChallengeResult>;
}

// ============================================
// HOOK
// ============================================

export function useChallenges({ shopDomain }: UseChallengesProps): UseChallengesReturn {
  const [challenges, setChallenges] = useState<ChallengeInfo[]>([]);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pointsBalance, setPointsBalance] = useState(0);
  const [config, setConfig] = useState<{ currencyName: string; currencyIcon: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const apiClient = useApiClient({
    baseUrl: '/api/customer-account/challenges',
    shopDomain,
  });

  const fetchChallenges = useCallback(async (sessionToken: string) => {
    logger.debug('useChallenges: Fetching challenges');
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.get<ChallengesData>(sessionToken, '');

      if (response.success && response.data) {
        setIsEnabled(response.data.enabled);
        setChallenges(response.data.challenges || []);
        setPointsBalance(response.data.pointsBalance || 0);
        setConfig(response.data.config || null);
        setMessage(response.data.message || null);
      } else {
        setError(response.error || 'Failed to fetch challenges');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('useChallenges: Error fetching challenges:', errorMessage);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [apiClient]);

  const claimReward = useCallback(async (
    sessionToken: string,
    challengeId: string
  ): Promise<ClaimChallengeResult> => {
    logger.debug('useChallenges: Claiming reward', { challengeId });

    try {
      const response = await apiClient.post<ClaimChallengeResult>(sessionToken, '', {
        challengeId,
        intent: 'claim',
      });

      if (response.success && response.data) {
        // Update local points balance if provided
        if (response.data.newBalance !== undefined) {
          setPointsBalance(response.data.newBalance);
        }

        // Refresh challenges to update status
        await fetchChallenges(sessionToken);

        return response.data;
      }

      return {
        success: false,
        error: response.error || 'Failed to claim reward',
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('useChallenges: Error claiming reward:', errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }, [apiClient, fetchChallenges]);

  return {
    challenges,
    isEnabled,
    isLoading,
    error,
    pointsBalance,
    config,
    message,
    fetchChallenges,
    claimReward,
  };
}
