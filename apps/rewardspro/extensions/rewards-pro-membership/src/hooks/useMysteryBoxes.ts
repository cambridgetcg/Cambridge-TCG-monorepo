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
  id?: string;
  name: string;
  type: string;
  value: Record<string, unknown>;
  rarity: string;
  actualValue?: number;
}

// Psychology Types
export interface MysteryBoxStreakInfo {
  currentStreak: number;
  longestStreak: number;
  streakEmoji: string;
  streakLabel: string;
  bonusMultiplier: number;
  bonusPercent: number;
  hoursUntilStreakLoss: number;
  freeOpensAvailable: number;
  canClaimFreeOpen: boolean;
}

export interface MysteryBoxPityInfo {
  commonsSinceRare: number;
  threshold: number;
  progress: number;
  willTrigger: boolean;
  minimumRarity: 'COMMON' | 'UNCOMMON' | 'RARE';
}

export interface MysteryBoxActivityItem {
  id: string;
  activityType: string;
  displayName: string;
  data: {
    rewardName?: string;
    rarity?: string;
    pointsWon?: number;
    streakDays?: number;
    luckyStreakCount?: number;
    boxName?: string;
  };
  timeAgo: string;
  emoji: string;
  createdAt: string;
}

export interface MysteryBoxBonusEvent {
  id: string;
  name: string;
  description: string | null;
  eventType: string;
  discountPercent: number;
  bonusMultiplier: number;
  endsAt: string;
  timeRemaining: string | null;
  secondsRemaining: number;
}

export interface NearMissInfo {
  rewardId: string;
  rewardName: string;
  rarity: string;
  percentageAway: number;
  message: string;
}

export interface PityProgress {
  current: number;
  threshold: number;
  message: string;
}

export interface CelebrationEvent {
  type: 'STREAK_MILESTONE' | 'LUCKY_STREAK' | 'PITY_TRIGGERED' | 'RARE_WIN' | 'EPIC_WIN' | 'LEGENDARY_WIN';
  data: Record<string, unknown>;
  message: string;
  emoji: string;
}

export interface PsychologyBonuses {
  streak: {
    applied: boolean;
    multiplier: number;
    days: number;
  };
  luckyStreak: {
    applied: boolean;
    multiplier: number;
    count: number;
  };
  event: {
    applied: boolean;
    name: string;
    discount: number;
    multiplier: number;
  } | null;
  totalMultiplier: number;
}

export interface OpenBoxResult {
  success: boolean;
  openId?: string;
  winnerId?: string;
  reward?: MysteryBoxReward;
  pointsSpent?: number;
  originalCost?: number;
  discountApplied?: number;
  newBalance?: number;
  bonuses?: PsychologyBonuses;
  nearMiss?: NearMissInfo | null;
  pityProgress?: PityProgress;
  celebrations?: CelebrationEvent[];
  isFreeOpen?: boolean;
  message?: string;
  error?: string;
}

export interface MysteryBoxHistoryEntry {
  id: string;
  boxName: string;
  rewardName: string;
  rewardType: string;
  rarity: string;
  pointsSpent: number;
  openedAt: string;
}

export interface MysteryBoxesData {
  enabled: boolean;
  authenticated: boolean;
  boxes: MysteryBoxInfo[];
  pointsBalance: number;
  streak?: {
    currentStreak: number;
    bonusPercent: number;
    streakEmoji: string;
    streakLabel: string;
    freeOpensAvailable: number;
    canClaimFreeOpen: boolean;
  };
  config: {
    currencyName: string;
    currencyIcon: string;
  };
}

export interface MysteryBoxPsychologyData {
  streak: MysteryBoxStreakInfo;
  luckyStreak: {
    count: number;
    isActive: boolean;
    multiplier: number;
    message: string;
  };
  pity: MysteryBoxPityInfo;
  bonusEvents: MysteryBoxBonusEvent[];
  bestBonusEvent: MysteryBoxBonusEvent | null;
  activities: MysteryBoxActivityItem[];
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
  history: MysteryBoxHistoryEntry[];
  historyLoading: boolean;
  // Psychology data
  streak: MysteryBoxStreakInfo | null;
  pity: MysteryBoxPityInfo | null;
  activities: MysteryBoxActivityItem[];
  bonusEvents: MysteryBoxBonusEvent[];
  bestBonusEvent: MysteryBoxBonusEvent | null;
  psychologyLoading: boolean;
  // Methods
  fetchBoxes: (sessionToken: string) => Promise<void>;
  fetchHistory: (sessionToken: string) => Promise<void>;
  fetchPsychology: (sessionToken: string, boxId?: string) => Promise<void>;
  fetchActivities: (sessionToken: string, boxId?: string) => Promise<void>;
  openBox: (sessionToken: string, boxId: string) => Promise<OpenBoxResult>;
  claimFreeOpen: (sessionToken: string, boxId: string) => Promise<OpenBoxResult>;
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
  const [history, setHistory] = useState<MysteryBoxHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Psychology state
  const [streak, setStreak] = useState<MysteryBoxStreakInfo | null>(null);
  const [pity, setPity] = useState<MysteryBoxPityInfo | null>(null);
  const [activities, setActivities] = useState<MysteryBoxActivityItem[]>([]);
  const [bonusEvents, setBonusEvents] = useState<MysteryBoxBonusEvent[]>([]);
  const [bestBonusEvent, setBestBonusEvent] = useState<MysteryBoxBonusEvent | null>(null);
  const [psychologyLoading, setPsychologyLoading] = useState(false);

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

        // Update basic streak info from main response
        if (response.data.streak) {
          setStreak((prev) => ({
            ...prev,
            currentStreak: response.data.streak!.currentStreak,
            bonusPercent: response.data.streak!.bonusPercent,
            streakEmoji: response.data.streak!.streakEmoji,
            streakLabel: response.data.streak!.streakLabel,
            freeOpensAvailable: response.data.streak!.freeOpensAvailable,
            canClaimFreeOpen: response.data.streak!.canClaimFreeOpen,
            longestStreak: prev?.longestStreak || 0,
            bonusMultiplier: prev?.bonusMultiplier || 1,
            hoursUntilStreakLoss: prev?.hoursUntilStreakLoss || 0,
          }));
        }
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

  const fetchHistory = useCallback(async (sessionToken: string) => {
    logger.debug('useMysteryBoxes: Fetching history');
    setHistoryLoading(true);

    try {
      const response = await apiClient.get<{ history: MysteryBoxHistoryEntry[] }>(
        sessionToken,
        '?action=history'
      );

      if (response.success && response.data) {
        setHistory(response.data.history || []);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('useMysteryBoxes: Error fetching history:', errorMessage);
    } finally {
      setHistoryLoading(false);
    }
  }, [apiClient]);

  const fetchPsychology = useCallback(async (sessionToken: string, boxId?: string) => {
    logger.debug('useMysteryBoxes: Fetching psychology', { boxId });
    setPsychologyLoading(true);

    try {
      const queryParams = boxId ? `?action=psychology&boxId=${boxId}` : '?action=psychology';
      const response = await apiClient.get<{ psychology: MysteryBoxPsychologyData }>(
        sessionToken,
        queryParams
      );

      if (response.success && response.data?.psychology) {
        const psych = response.data.psychology;
        setStreak(psych.streak);
        setPity(psych.pity);
        setActivities(psych.activities || []);
        setBonusEvents(psych.bonusEvents || []);
        setBestBonusEvent(psych.bestBonusEvent);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('useMysteryBoxes: Error fetching psychology:', errorMessage);
    } finally {
      setPsychologyLoading(false);
    }
  }, [apiClient]);

  const fetchActivities = useCallback(async (sessionToken: string, boxId?: string) => {
    logger.debug('useMysteryBoxes: Fetching activities', { boxId });

    try {
      const queryParams = boxId ? `?action=activity&boxId=${boxId}` : '?action=activity';
      const response = await apiClient.get<{ activities: MysteryBoxActivityItem[] }>(
        sessionToken,
        queryParams
      );

      if (response.success && response.data) {
        setActivities(response.data.activities || []);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('useMysteryBoxes: Error fetching activities:', errorMessage);
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

        // Refresh boxes and psychology to update counts and streak
        await Promise.all([
          fetchBoxes(sessionToken),
          fetchPsychology(sessionToken, boxId),
        ]);

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
  }, [apiClient, fetchBoxes, fetchPsychology]);

  const claimFreeOpen = useCallback(async (
    sessionToken: string,
    boxId: string
  ): Promise<OpenBoxResult> => {
    logger.debug('useMysteryBoxes: Claiming free open', { boxId });

    try {
      const response = await apiClient.post<OpenBoxResult>(sessionToken, '', {
        boxId,
        intent: 'free-open',
      });

      if (response.success && response.data) {
        // Refresh boxes and psychology to update counts and streak
        await Promise.all([
          fetchBoxes(sessionToken),
          fetchPsychology(sessionToken, boxId),
        ]);

        return response.data;
      }

      return {
        success: false,
        error: response.error || 'Failed to claim free open',
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('useMysteryBoxes: Error claiming free open:', errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }, [apiClient, fetchBoxes, fetchPsychology]);

  return {
    boxes,
    isEnabled,
    isLoading,
    error,
    pointsBalance,
    config,
    history,
    historyLoading,
    // Psychology data
    streak,
    pity,
    activities,
    bonusEvents,
    bestBonusEvent,
    psychologyLoading,
    // Methods
    fetchBoxes,
    fetchHistory,
    fetchPsychology,
    fetchActivities,
    openBox,
    claimFreeOpen,
  };
}
