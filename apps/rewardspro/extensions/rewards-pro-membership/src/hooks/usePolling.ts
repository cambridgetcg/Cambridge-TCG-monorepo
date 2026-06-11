import { useState, useCallback, useRef, useEffect } from 'react';
import { logger } from '../utils/logger';

// ============================================
// TYPES
// ============================================

export interface UsePollingOptions {
  /** Polling interval in milliseconds (default: 30000 = 30 seconds) */
  interval?: number;
  /** Background polling interval in milliseconds (default: 120000 = 2 minutes) */
  backgroundInterval?: number;
  /** Whether polling is initially enabled (default: true) */
  enabled?: boolean;
  /** Delay after user action before resuming polling (default: 5000 = 5 seconds) */
  postActionDelay?: number;
}

export interface UsePollingReturn {
  /** Whether polling is currently paused */
  isPaused: boolean;
  /** Timestamp of the last successful poll */
  lastPollTime: number | null;
  /** Time in seconds since last poll */
  staleness: number;
  /** Whether data is considered stale (> 60 seconds) */
  isStale: boolean;
  /** Pause polling */
  pause: () => void;
  /** Resume polling */
  resume: () => void;
  /** Trigger an immediate poll */
  pollNow: () => void;
  /** Notify that a user action occurred (delays next poll) */
  notifyAction: () => void;
  /** Set whether the tab is in background */
  setIsBackground: (isBackground: boolean) => void;
}

// ============================================
// HOOK
// ============================================

/**
 * usePolling - Hook for managing periodic data refresh
 *
 * Provides intelligent polling with:
 * - Configurable intervals
 * - Background/foreground awareness
 * - Post-action delay to avoid redundant fetches
 * - Staleness tracking
 *
 * @example
 * ```tsx
 * const { isPaused, isStale, pollNow, notifyAction } = usePolling({
 *   interval: 30000,
 *   enabled: true,
 *   onPoll: async () => {
 *     await fetchRaffles(sessionToken);
 *   },
 * });
 * ```
 */
export function usePolling(
  onPoll: () => Promise<void>,
  options: UsePollingOptions = {}
): UsePollingReturn {
  const {
    interval = 30000, // 30 seconds
    backgroundInterval = 120000, // 2 minutes
    enabled = true,
    postActionDelay = 5000, // 5 seconds
  } = options;

  const [isPaused, setIsPaused] = useState(!enabled);
  const [lastPollTime, setLastPollTime] = useState<number | null>(null);
  const [staleness, setStaleness] = useState(0);
  const [isBackground, setIsBackground] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stalenessIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const actionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPollingRef = useRef(false);

  // Calculate if data is stale (> 60 seconds old)
  const isStale = staleness > 60;

  // Execute poll with error handling
  const executePoll = useCallback(async () => {
    if (isPollingRef.current) {
      logger.debug('usePolling: Skipping poll, already in progress');
      return;
    }

    isPollingRef.current = true;
    logger.debug('usePolling: Executing poll');

    try {
      await onPoll();
      setLastPollTime(Date.now());
      setStaleness(0);
    } catch (err) {
      logger.error('usePolling: Poll failed:', err);
    } finally {
      isPollingRef.current = false;
    }
  }, [onPoll]);

  // Start the polling interval
  const startPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const currentInterval = isBackground ? backgroundInterval : interval;
    logger.debug(`usePolling: Starting polling with interval ${currentInterval}ms`);

    intervalRef.current = setInterval(() => {
      if (!isPaused) {
        executePoll();
      }
    }, currentInterval);
  }, [isBackground, backgroundInterval, interval, isPaused, executePoll]);

  // Update staleness counter
  useEffect(() => {
    if (stalenessIntervalRef.current) {
      clearInterval(stalenessIntervalRef.current);
    }

    stalenessIntervalRef.current = setInterval(() => {
      if (lastPollTime) {
        setStaleness(Math.floor((Date.now() - lastPollTime) / 1000));
      }
    }, 1000);

    return () => {
      if (stalenessIntervalRef.current) {
        clearInterval(stalenessIntervalRef.current);
      }
    };
  }, [lastPollTime]);

  // Start/restart polling when settings change
  useEffect(() => {
    if (!isPaused && enabled) {
      startPolling();
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPaused, enabled, isBackground, startPolling]);

  // Pause polling
  const pause = useCallback(() => {
    logger.debug('usePolling: Pausing');
    setIsPaused(true);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Resume polling
  const resume = useCallback(() => {
    logger.debug('usePolling: Resuming');
    setIsPaused(false);
  }, []);

  // Trigger immediate poll
  const pollNow = useCallback(() => {
    logger.debug('usePolling: Immediate poll requested');
    executePoll();
  }, [executePoll]);

  // Notify of user action (delays next poll)
  const notifyAction = useCallback(() => {
    logger.debug('usePolling: User action notified');

    // Clear any existing timeout
    if (actionTimeoutRef.current) {
      clearTimeout(actionTimeoutRef.current);
    }

    // Pause and restart after delay
    pause();

    actionTimeoutRef.current = setTimeout(() => {
      resume();
      // Trigger immediate poll after action delay
      executePoll();
    }, postActionDelay);
  }, [pause, resume, executePoll, postActionDelay]);

  // Handle background state changes
  const handleSetIsBackground = useCallback((background: boolean) => {
    logger.debug(`usePolling: Setting background state to ${background}`);
    setIsBackground(background);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (stalenessIntervalRef.current) {
        clearInterval(stalenessIntervalRef.current);
      }
      if (actionTimeoutRef.current) {
        clearTimeout(actionTimeoutRef.current);
      }
    };
  }, []);

  return {
    isPaused,
    lastPollTime,
    staleness,
    isStale,
    pause,
    resume,
    pollNow,
    notifyAction,
    setIsBackground: handleSetIsBackground,
  };
}

// ============================================
// HELPER COMPONENTS
// ============================================

/**
 * Format staleness for display
 * @param seconds - Seconds since last poll
 * @returns Human-readable staleness string
 */
export function formatStaleness(seconds: number): string {
  if (seconds < 60) {
    return 'Just now';
  }
  if (seconds < 120) {
    return '1 minute ago';
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)} minutes ago`;
  }
  return 'Over an hour ago';
}
