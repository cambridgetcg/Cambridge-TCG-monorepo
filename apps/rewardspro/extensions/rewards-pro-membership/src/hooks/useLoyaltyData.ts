import { useCallback, useEffect, useState } from "react";
import type { ApiClient } from "../utils/apiClient";
import { logger } from "../utils/logger";
import type { LoyaltyData } from "../types/loyaltyData";

/**
 * Owns the loyalty data lifecycle for MembershipBlock:
 *   - Initial fetch when authenticated.
 *   - Refresh-on-demand (pull-to-refresh pattern).
 *   - Editor mock injection (Shopify checkout editor preview).
 *   - Loading / refreshing / error state bundled into one return object
 *     so the orchestrator doesn't juggle four useState setters.
 *
 * Extracted from MembershipBlock.tsx 2026-04-23 — the orchestrator had
 * grown to 1000+ lines; the fetch lifecycle is a self-contained concern
 * that benefits from living next to other hooks in the same folder.
 */
export interface UseLoyaltyDataInput {
  apiClient: ApiClient;
  sessionToken: string | null;
  isAuthenticated: boolean;
  /** True when rendering inside Shopify's theme/checkout editor preview. */
  isInEditor: boolean;
  /** Generates mock data for the editor preview. */
  getMockData: () => LoyaltyData;
  /** i18n translator for the default error message. */
  translate: (key: string) => string;
}

export interface UseLoyaltyDataReturn {
  loyaltyData: LoyaltyData | null;
  /** True during the first fetch (distinct from isRefreshing). */
  isLoading: boolean;
  /** True during an explicit refresh — used to show a spinner on the refresh button. */
  isRefreshing: boolean;
  error: string | null;
  /** Manual refresh. No-op if a refresh is already in flight. */
  refresh: () => void;
}

export function useLoyaltyData({
  apiClient,
  sessionToken,
  isAuthenticated,
  isInEditor,
  getMockData,
  translate,
}: UseLoyaltyDataInput): UseLoyaltyDataReturn {
  const [loyaltyData, setLoyaltyData] = useState<LoyaltyData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLoyaltyData = useCallback(
    async (isRefresh = false) => {
      logger.debug("useLoyaltyData: fetch", {
        isAuthenticated,
        hasSessionToken: !!sessionToken,
        isInEditor,
        isRefresh,
      });

      if (isInEditor) {
        // Editor preview — show mock data so merchants see the widget
        // design without a real customer session.
        setLoyaltyData(getMockData());
        return;
      }

      if (!isAuthenticated || !sessionToken) {
        return;
      }

      try {
        if (isRefresh) {
          setIsRefreshing(true);
        } else {
          setIsLoading(true);
        }
        setError(null);

        const response = await apiClient.get<LoyaltyData>(sessionToken, "");

        if (response.success && response.data) {
          setLoyaltyData(response.data);
        } else if (response.data?.isPreview) {
          setLoyaltyData(getMockData());
        } else {
          const errorMsg = response.error || translate("membership.error.generic");
          logger.error("useLoyaltyData: API error:", errorMsg);
          setError(errorMsg);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        logger.error("useLoyaltyData: exception during fetch:", errorMessage);
        // Only surface errors to authenticated customers — unauthenticated
        // state is the preview banner, not an error.
        if (isAuthenticated) {
          setError(errorMessage);
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [apiClient, sessionToken, isAuthenticated, isInEditor, getMockData, translate]
  );

  // Initial fetch + re-fetch when dependencies change (e.g., token refresh).
  useEffect(() => {
    fetchLoyaltyData();
  }, [fetchLoyaltyData]);

  const refresh = useCallback(() => {
    if (!isRefreshing) {
      fetchLoyaltyData(true);
    }
  }, [isRefreshing, fetchLoyaltyData]);

  return { loyaltyData, isLoading, isRefreshing, error, refresh };
}
