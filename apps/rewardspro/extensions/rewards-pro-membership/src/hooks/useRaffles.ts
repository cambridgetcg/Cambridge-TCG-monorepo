import { useState, useCallback, useEffect, useRef } from 'react';
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
  reason?: string;
  startsAt: string;
  endsAt: string;
  totalEntries: number;
  uniqueEntrants: number;
}

// Psychology Types
export interface RaffleStreakInfo {
  currentStreak: number;
  longestStreak: number;
  streakEmoji: string;
  streakLabel: string;
  bonusMultiplier: number;
  bonusPercent: number;
  hoursUntilStreakLoss: number;
  freeEntriesAvailable: number;
  canClaimFreeEntry: boolean;
}

export interface RaffleActivityItem {
  id: string;
  activityType: string;
  displayName: string;
  data: Record<string, unknown>;
  timeAgo: string;
  emoji: string;
}

export interface RaffleBonusEvent {
  id: string;
  name: string;
  description: string | null;
  eventType: string;
  bonusMultiplier: number;
  bonusEntriesFlat: number;
  discountPercent: number;
  endsAt: string;
  timeRemaining: string | null;
  secondsRemaining: number;
}

export interface InstantWin {
  won: boolean;
  prize: {
    name: string;
    rarity: string;
    prizeType: string;
  } | null;
  nearMiss: { name: string; rarity: string } | null;
  message: string;
}

export interface CelebrationEvent {
  type: 'STREAK_MILESTONE' | 'INSTANT_WIN' | 'LUCKY_NUMBER' | 'EARLY_BIRD';
  data: Record<string, unknown>;
  message: string;
  emoji: string;
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
  // Psychology enhancements
  finalEntries?: number;
  bonuses?: {
    streak?: { applied: boolean; multiplier: number; days: number };
    earlyBird?: { applied: boolean; percent: number };
    bonusEvent?: { applied: boolean; name: string; multiplier: number };
    luckyNumber?: { applied: boolean; number: number; bonusEntries: number };
  };
  instantWins?: InstantWin[];
  celebrations?: CelebrationEvent[];
}

export type RafflePrizeType = 'DISCOUNT' | 'STORE_CREDIT' | 'PRODUCT' | 'POINTS' | 'CUSTOM';

export interface RaffleHistoryPrize {
  id: string;
  name: string;
  description: string | null;
  prizeType: RafflePrizeType;
  prizeValue: {
    // DISCOUNT
    type?: 'percentage' | 'fixed';
    value?: number;
    // STORE_CREDIT / POINTS
    amount?: number;
    // PRODUCT
    productTitle?: string;
    quantity?: number;
    // CUSTOM
    fulfillmentInstructions?: string;
  };
  deliveryStatus: string;
  deliveredAt: string | null;
  discountCode: string | null;
}

export interface RaffleHistoryEntry {
  id: string;
  raffleName: string;
  entriesCount: number;
  pointsSpent: number;
  enteredAt: string;
  raffleStatus: string;
  isWinner: boolean;
  /** Enhanced prize details for winners - includes type, value, and delivery status */
  prize: RaffleHistoryPrize | null;
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

export interface RafflePsychologyData {
  streak: RaffleStreakInfo;
  activities: RaffleActivityItem[];
  bonusEvents: RaffleBonusEvent[];
  bestBonusEvent: RaffleBonusEvent | null;
}

interface UseRafflesProps {
  shopDomain?: string;
}

interface UseRafflesReturn {
  // Core data
  raffles: RaffleInfo[];
  isEnabled: boolean;
  isLoading: boolean;
  error: string | null;
  pointsBalance: number;
  config: { currencyName: string; currencyIcon: string } | null;
  history: RaffleHistoryEntry[];
  historyLoading: boolean;

  // Psychology data
  streak: RaffleStreakInfo | null;
  activities: RaffleActivityItem[];
  bonusEvents: RaffleBonusEvent[];
  bestBonusEvent: RaffleBonusEvent | null;
  psychologyLoading: boolean;

  // Purchase result state (for showing celebration modals)
  lastPurchaseResult: RaffleEntryResult | null;
  clearPurchaseResult: () => void;

  // Free entry state
  isClaimingFreeEntry: boolean;
  freeEntryError: string | null;

  // Core actions
  fetchRaffles: (sessionToken: string) => Promise<void>;
  fetchHistory: (sessionToken: string) => Promise<void>;
  purchaseEntries: (
    sessionToken: string,
    raffleId: string,
    quantity: number
  ) => Promise<RaffleEntryResult>;

  // Psychology actions
  fetchPsychology: (sessionToken: string) => Promise<void>;
  fetchActivities: (sessionToken: string, raffleId?: string) => Promise<void>;
  claimFreeEntry: (sessionToken: string, raffleId: string) => Promise<RaffleEntryResult>;
}

// ============================================
// HOOK
// ============================================

export function useRaffles({ shopDomain }: UseRafflesProps): UseRafflesReturn {
  // Core state
  const [raffles, setRaffles] = useState<RaffleInfo[]>([]);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pointsBalance, setPointsBalance] = useState(0);
  const [config, setConfig] = useState<{ currencyName: string; currencyIcon: string } | null>(null);
  const [history, setHistory] = useState<RaffleHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Psychology state
  const [streak, setStreak] = useState<RaffleStreakInfo | null>(null);
  const [activities, setActivities] = useState<RaffleActivityItem[]>([]);
  const [bonusEvents, setBonusEvents] = useState<RaffleBonusEvent[]>([]);
  const [bestBonusEvent, setBestBonusEvent] = useState<RaffleBonusEvent | null>(null);
  const [psychologyLoading, setPsychologyLoading] = useState(false);

  // Purchase result state (for celebration modals)
  const [lastPurchaseResult, setLastPurchaseResult] = useState<RaffleEntryResult | null>(null);

  // Free entry state
  const [isClaimingFreeEntry, setIsClaimingFreeEntry] = useState(false);
  const [freeEntryError, setFreeEntryError] = useState<string | null>(null);

  // Activity polling reference
  const activityPollRef = useRef<NodeJS.Timeout | null>(null);

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

  // ============================================
  // PSYCHOLOGY DATA FETCHING
  // ============================================

  const fetchPsychology = useCallback(async (sessionToken: string) => {
    logger.debug('useRaffles: Fetching psychology data');
    setPsychologyLoading(true);

    try {
      const response = await apiClient.get<RafflePsychologyData>(
        sessionToken,
        '?action=psychology'
      );

      if (response.success && response.data) {
        setStreak(response.data.streak || null);
        setActivities(response.data.activities || []);
        setBonusEvents(response.data.bonusEvents || []);
        setBestBonusEvent(response.data.bestBonusEvent || null);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('useRaffles: Error fetching psychology:', errorMessage);
    } finally {
      setPsychologyLoading(false);
    }
  }, [apiClient]);

  const fetchActivities = useCallback(async (sessionToken: string, raffleId?: string) => {
    logger.debug('useRaffles: Fetching activities', { raffleId });

    try {
      const queryParams = raffleId
        ? `?action=activity&raffleId=${raffleId}`
        : '?action=activity';

      const response = await apiClient.get<{ activities: RaffleActivityItem[] }>(
        sessionToken,
        queryParams
      );

      if (response.success && response.data) {
        setActivities(response.data.activities || []);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('useRaffles: Error fetching activities:', errorMessage);
    }
  }, [apiClient]);

  const claimFreeEntry = useCallback(async (
    sessionToken: string,
    raffleId: string
  ): Promise<RaffleEntryResult> => {
    logger.debug('useRaffles: Claiming free entry', { raffleId });
    setIsClaimingFreeEntry(true);
    setFreeEntryError(null);

    try {
      const response = await apiClient.post<RaffleEntryResult>(sessionToken, '', {
        raffleId,
        intent: 'free-entry',
      });

      if (response.success && response.data) {
        // Update points balance if returned
        if (response.data.newBalance !== undefined) {
          setPointsBalance(response.data.newBalance);
        }

        // Update streak info (free entries available decremented)
        if (streak) {
          setStreak({
            ...streak,
            freeEntriesAvailable: Math.max(0, streak.freeEntriesAvailable - 1),
            canClaimFreeEntry: streak.freeEntriesAvailable > 1,
          });
        }

        // Refresh raffles to update entry counts
        await fetchRaffles(sessionToken);

        // Store result for celebration display
        setLastPurchaseResult(response.data);

        return response.data;
      }

      const errorMsg = response.error || 'Failed to claim free entry';
      setFreeEntryError(errorMsg);
      return {
        success: false,
        error: errorMsg,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('useRaffles: Error claiming free entry:', errorMessage);
      setFreeEntryError(errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      setIsClaimingFreeEntry(false);
    }
  }, [apiClient, fetchRaffles, streak]);

  const clearPurchaseResult = useCallback(() => {
    setLastPurchaseResult(null);
  }, []);

  // ============================================
  // PURCHASE WITH PSYCHOLOGY
  // ============================================

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

        // Store result for celebration modal display
        // This includes instant wins, bonuses, and celebrations
        setLastPurchaseResult(response.data);

        // If streak bonus was applied, refresh psychology data
        if (response.data.bonuses?.streak?.applied) {
          // Update streak locally for immediate feedback
          if (streak) {
            setStreak({
              ...streak,
              currentStreak: response.data.bonuses.streak.days,
              bonusMultiplier: response.data.bonuses.streak.multiplier,
              bonusPercent: Math.round((response.data.bonuses.streak.multiplier - 1) * 100),
            });
          }
        }

        // Refresh raffles to update entry counts
        await fetchRaffles(sessionToken);

        // Refresh activities to show new entry in feed
        await fetchActivities(sessionToken, raffleId);

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
  }, [apiClient, fetchRaffles, fetchActivities, streak]);

  return {
    // Core data
    raffles,
    isEnabled,
    isLoading,
    error,
    pointsBalance,
    config,
    history,
    historyLoading,

    // Psychology data
    streak,
    activities,
    bonusEvents,
    bestBonusEvent,
    psychologyLoading,

    // Purchase result state
    lastPurchaseResult,
    clearPurchaseResult,

    // Free entry state
    isClaimingFreeEntry,
    freeEntryError,

    // Core actions
    fetchRaffles,
    fetchHistory,
    purchaseEntries,

    // Psychology actions
    fetchPsychology,
    fetchActivities,
    claimFreeEntry,
  };
}
