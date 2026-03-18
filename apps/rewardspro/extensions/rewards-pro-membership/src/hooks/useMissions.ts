import { useState, useCallback, useRef } from 'react';
import { useApiClient } from './useApiClient';
import { logger } from '../utils/logger';

// ============================================
// TYPES
// ============================================

export type MissionCadence = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'SPECIAL';
export type MissionRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
export type MissionCategory = 'SHOPPING' | 'DISCOVERY' | 'SOCIAL' | 'STREAK' | 'CHALLENGE';
export type MissionStatus = 'AVAILABLE' | 'IN_PROGRESS' | 'COMPLETED' | 'CLAIMED';

export interface MissionObjective {
  type: string;
  target: number;
  current: number;
  percent: number;
}

export interface MissionReward {
  type: string;
  description: string;
}

export interface MissionInfo {
  id: string;
  name: string;
  description: string | null;
  iconEmoji: string | null;
  imageUrl: string | null;
  cadence: MissionCadence;
  rarity: MissionRarity;
  category: MissionCategory;
  objective: MissionObjective;
  reward: MissionReward;
  xpReward: number;
  endsAt: string | null;
  timeRemaining: string | null;
  status: MissionStatus;
  isEligible: boolean;
}

export interface PlayerStats {
  // XP & Level
  xp: number;
  level: number;
  xpProgress: number;
  xpToNextLevel: number;
  xpProgressPercent: number;

  // Streak
  streak: number;
  streakEmoji: string;
  streakLabel: string;
  streakBonus: number;
  hoursUntilStreakLoss: number;

  // Combo
  todayComboCount: number;
  comboBonus: number;
  nextComboBonus: number;
  isMaxCombo: boolean;

  // Totals
  totalCompleted: number;
  dailyCompleted: number;
  weeklyCompleted: number;
  monthlyCompleted: number;
}

export interface MissionEvent {
  id: string;
  eventType: string;
  xpEarned: number;
  bonusXp: number;
  triggersConfetti: boolean;
  triggersLevelUp: boolean;
  triggersStreakFire: boolean;
  payload: Record<string, unknown> | null;
  acknowledged: boolean;
  createdAt: string;
}

export interface ClaimMissionResult {
  success: boolean;
  rewardType?: string;
  rewardValue?: number | string;
  newBalance?: number;
  message?: string;
  error?: string;
}

export interface MissionsData {
  success: boolean;
  enabled: boolean;
  authenticated: boolean;
  player: PlayerStats;
  missions: {
    daily: MissionInfo[];
    weekly: MissionInfo[];
    monthly: MissionInfo[];
    special: MissionInfo[];
  };
  pendingEvents: MissionEvent[];
  config: {
    currencyName: string;
    currencyIcon: string;
  };
  message?: string;
}

interface UseMissionsProps {
  shopDomain?: string;
}

interface UseMissionsReturn {
  // Data
  player: PlayerStats | null;
  missions: {
    daily: MissionInfo[];
    weekly: MissionInfo[];
    monthly: MissionInfo[];
    special: MissionInfo[];
  };
  pendingEvents: MissionEvent[];
  config: { currencyName: string; currencyIcon: string } | null;

  // State
  isEnabled: boolean;
  isLoading: boolean;
  error: string | null;
  message: string | null;

  // Actions
  fetchMissions: (sessionToken: string) => Promise<void>;
  claimReward: (sessionToken: string, missionId: string) => Promise<ClaimMissionResult>;
  acknowledgeEvents: (sessionToken: string, eventIds: string[]) => Promise<void>;
}

// ============================================
// DEFAULT STATE
// ============================================

const defaultMissions: {
  daily: MissionInfo[];
  weekly: MissionInfo[];
  monthly: MissionInfo[];
  special: MissionInfo[];
} = {
  daily: [],
  weekly: [],
  monthly: [],
  special: [],
};

// ============================================
// HOOK
// ============================================

export function useMissions({ shopDomain }: UseMissionsProps): UseMissionsReturn {
  const [player, setPlayer] = useState<PlayerStats | null>(null);
  const [missions, setMissions] = useState<typeof defaultMissions>(defaultMissions);
  const [pendingEvents, setPendingEvents] = useState<MissionEvent[]>([]);
  const [config, setConfig] = useState<{ currencyName: string; currencyIcon: string } | null>(null);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Track if we're currently fetching to prevent duplicate requests
  const isFetchingRef = useRef(false);

  const apiClient = useApiClient({
    baseUrl: '/api/customer-account/missions',
    shopDomain,
  });

  const fetchMissions = useCallback(async (sessionToken: string) => {
    // Prevent duplicate concurrent requests
    if (isFetchingRef.current) {
      logger.debug('useMissions: Skipping duplicate fetch');
      return;
    }

    logger.debug('useMissions: Fetching missions');
    isFetchingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.get<MissionsData>(sessionToken, '');

      if (response.success && response.data) {
        setIsEnabled(response.data.enabled !== false);
        setPlayer(response.data.player);
        setMissions(response.data.missions || defaultMissions);
        setPendingEvents(response.data.pendingEvents || []);
        setConfig(response.data.config || null);
        setMessage(response.data.message || null);
      } else {
        setError(response.error || 'Failed to fetch missions');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('useMissions: Error fetching missions:', errorMessage);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [apiClient]);

  const claimReward = useCallback(async (
    sessionToken: string,
    missionId: string
  ): Promise<ClaimMissionResult> => {
    logger.debug('useMissions: Claiming reward', { missionId });

    try {
      const response = await apiClient.post<ClaimMissionResult>(sessionToken, '', {
        missionId,
        intent: 'claim',
      });

      if (response.success && response.data) {
        // Refresh missions to update status and get new events
        await fetchMissions(sessionToken);

        return response.data;
      }

      return {
        success: false,
        error: response.error || 'Failed to claim reward',
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('useMissions: Error claiming reward:', errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }, [apiClient, fetchMissions]);

  const acknowledgeEvents = useCallback(async (
    sessionToken: string,
    eventIds: string[]
  ): Promise<void> => {
    if (eventIds.length === 0) return;

    logger.debug('useMissions: Acknowledging events', { eventIds });

    try {
      await apiClient.post(sessionToken, '/ack', {
        eventIds,
        intent: 'acknowledge',
      });

      // Remove acknowledged events from local state
      setPendingEvents(prev => prev.filter(e => !eventIds.includes(e.id)));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('useMissions: Error acknowledging events:', errorMessage);
    }
  }, [apiClient]);

  return {
    player,
    missions,
    pendingEvents,
    config,
    isEnabled,
    isLoading,
    error,
    message,
    fetchMissions,
    claimReward,
    acknowledgeEvents,
  };
}
