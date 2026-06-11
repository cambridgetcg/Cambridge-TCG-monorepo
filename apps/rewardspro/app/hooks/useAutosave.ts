/**
 * useAutosave Hook
 *
 * Automatically saves template draft to localStorage and provides recovery.
 */

import { useState, useEffect, useCallback, useRef } from "react";

interface DraftData {
  name: string;
  type: string;
  subject: string;
  previewText: string;
  blocks: any[];
  styles: Record<string, any>;
  savedAt: number;
}

interface UseAutosaveOptions {
  /** Unique key for this template (use "new" for new templates, or template ID for edits) */
  templateKey: string;
  /** Interval in milliseconds (default: 30000 = 30 seconds) */
  interval?: number;
  /** Callback when draft is recovered */
  onRecover?: (draft: DraftData) => void;
}

interface UseAutosaveReturn {
  /** Whether there's a recoverable draft */
  hasDraft: boolean;
  /** The recovered draft data (if any) */
  draftData: DraftData | null;
  /** When the draft was saved */
  draftSavedAt: Date | null;
  /** Recover the draft (call onRecover callback) */
  recoverDraft: () => void;
  /** Dismiss the draft recovery banner */
  dismissDraft: () => void;
  /** Clear the draft (call after successful save) */
  clearDraft: () => void;
  /** Force save now (for explicit save points) */
  saveNow: () => void;
}

const STORAGE_PREFIX = "rewardspro_email_draft_";

export function useAutosave(
  currentData: Omit<DraftData, "savedAt">,
  options: UseAutosaveOptions
): UseAutosaveReturn {
  const { templateKey, interval = 30000, onRecover } = options;
  const storageKey = `${STORAGE_PREFIX}${templateKey}`;

  const [hasDraft, setHasDraft] = useState(false);
  const [draftData, setDraftData] = useState<DraftData | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const currentDataRef = useRef(currentData);
  currentDataRef.current = currentData;

  // Check for existing draft on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as DraftData;
        // Only show recovery if draft is less than 24 hours old
        const age = Date.now() - parsed.savedAt;
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        if (age < maxAge && parsed.blocks.length > 0) {
          setDraftData(parsed);
          setHasDraft(true);
        } else {
          // Draft is too old, clean it up
          localStorage.removeItem(storageKey);
        }
      }
    } catch (e) {
      console.error("[useAutosave] Error loading draft:", e);
    }
  }, [storageKey]);

  // Save to localStorage periodically
  useEffect(() => {
    const save = () => {
      try {
        const data: DraftData = {
          ...currentDataRef.current,
          savedAt: Date.now(),
        };
        localStorage.setItem(storageKey, JSON.stringify(data));
      } catch (e) {
        console.error("[useAutosave] Error saving draft:", e);
      }
    };

    // Initial save after a short delay
    const initialTimeout = setTimeout(save, 5000);

    // Regular saves
    const intervalId = setInterval(save, interval);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(intervalId);
    };
  }, [storageKey, interval]);

  // Recover draft
  const recoverDraft = useCallback(() => {
    if (draftData && onRecover) {
      onRecover(draftData);
      setHasDraft(false);
      setDismissed(true);
    }
  }, [draftData, onRecover]);

  // Dismiss draft recovery
  const dismissDraft = useCallback(() => {
    setHasDraft(false);
    setDismissed(true);
    // Don't delete from storage - user might change their mind
    // It will be overwritten by new autosaves anyway
  }, []);

  // Clear draft (after successful save)
  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
      setHasDraft(false);
      setDraftData(null);
    } catch (e) {
      console.error("[useAutosave] Error clearing draft:", e);
    }
  }, [storageKey]);

  // Force save now
  const saveNow = useCallback(() => {
    try {
      const data: DraftData = {
        ...currentDataRef.current,
        savedAt: Date.now(),
      };
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch (e) {
      console.error("[useAutosave] Error saving draft:", e);
    }
  }, [storageKey]);

  return {
    hasDraft: hasDraft && !dismissed,
    draftData,
    draftSavedAt: draftData ? new Date(draftData.savedAt) : null,
    recoverDraft,
    dismissDraft,
    clearDraft,
    saveNow,
  };
}

/**
 * Format relative time for display
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return "just now";
  if (diffMins === 1) return "1 minute ago";
  if (diffMins < 60) return `${diffMins} minutes ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;

  return date.toLocaleDateString();
}

export default useAutosave;
