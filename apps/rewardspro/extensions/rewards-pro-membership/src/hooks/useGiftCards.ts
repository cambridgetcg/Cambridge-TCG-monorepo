import { useState, useCallback, useRef } from 'react';
import { useApiClient } from './useApiClient';
import { logger } from '../utils/logger';

// ============================================
// TYPES
// ============================================

export interface GiftCardBundle {
  id: string;
  name: string;
  tierName: string | null;
  bundleType: string;
  giftCardValue: number;
  membershipDuration: number | null;
  price: number;
  description: string | null;
}

export interface IssuedGiftCard {
  id: string;
  lastFourDigits: string | null;
  initialValue: number;
  bonusValue: number;
  totalValue: number;
  status: string;
  bundledTierName: string | null;
  createdAt: string;
  redeemedAt: string | null;
  isPurchased: boolean;
  isReceived: boolean;
}

export interface ConvertResult {
  success: boolean;
  conversionId?: string;
  newBalance?: number;
  message?: string;
  error?: string;
}

interface GiftCardsData {
  success: boolean;
  bundles: GiftCardBundle[];
  issuedGiftCards: IssuedGiftCard[];
  storeCredit: number;
  tierName: string | null;
  tierBonus: number;
  enableConversion: boolean;
}

interface UseGiftCardsProps {
  shopDomain?: string;
}

interface UseGiftCardsReturn {
  bundles: GiftCardBundle[];
  issuedGiftCards: IssuedGiftCard[];
  storeCredit: number;
  tierName: string | null;
  tierBonus: number;
  enableConversion: boolean;
  isEnabled: boolean;
  isLoading: boolean;
  error: string | null;
  fetchGiftCards: (sessionToken: string) => Promise<void>;
  convertToGiftCard: (
    sessionToken: string,
    customerId: string,
    amount: number,
    recipientEmail?: string,
    message?: string,
  ) => Promise<ConvertResult>;
}

// ============================================
// HOOK
// ============================================

export function useGiftCards({ shopDomain }: UseGiftCardsProps): UseGiftCardsReturn {
  const [bundles, setBundles] = useState<GiftCardBundle[]>([]);
  const [issuedGiftCards, setIssuedGiftCards] = useState<IssuedGiftCard[]>([]);
  const [storeCredit, setStoreCredit] = useState(0);
  const [tierName, setTierName] = useState<string | null>(null);
  const [tierBonus, setTierBonus] = useState(0);
  const [enableConversion, setEnableConversion] = useState(true);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFetchingRef = useRef(false);

  const apiClient = useApiClient({
    baseUrl: '/api/customer-account/gift-cards',
    shopDomain,
  });

  const fetchGiftCards = useCallback(async (sessionToken: string) => {
    if (isFetchingRef.current) {
      logger.debug('useGiftCards: Skipping duplicate fetch');
      return;
    }

    logger.debug('useGiftCards: Fetching gift cards');
    isFetchingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.get<GiftCardsData>(sessionToken, '');

      if (response.success && response.data) {
        const data = response.data;
        setIsEnabled(data.bundles.length > 0 || data.issuedGiftCards.length > 0 || data.enableConversion);
        setBundles(data.bundles || []);
        setIssuedGiftCards(data.issuedGiftCards || []);
        setStoreCredit(data.storeCredit ?? 0);
        setTierName(data.tierName ?? null);
        setTierBonus(data.tierBonus ?? 0);
        setEnableConversion(data.enableConversion !== false);
      } else {
        setError(response.error || 'Failed to fetch gift card data');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('useGiftCards: Error fetching:', errorMessage);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [apiClient]);

  const convertToGiftCard = useCallback(async (
    sessionToken: string,
    customerId: string,
    amount: number,
    recipientEmail?: string,
    message?: string,
  ): Promise<ConvertResult> => {
    logger.debug('useGiftCards: Converting store credit', { amount });

    try {
      const response = await apiClient.post<ConvertResult>(sessionToken, '', {
        action: 'convert_to_gift_card',
        customer_id: customerId,
        amount,
        recipient_email: recipientEmail,
        message,
      });

      if (response.success && response.data) {
        // Update local store credit balance
        if (response.data.newBalance !== undefined) {
          setStoreCredit(response.data.newBalance);
        }
        // Refresh to get updated issued cards list
        await fetchGiftCards(sessionToken);
        return response.data;
      }

      return {
        success: false,
        error: response.error || 'Conversion failed',
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('useGiftCards: Error converting:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [apiClient, fetchGiftCards]);

  return {
    bundles,
    issuedGiftCards,
    storeCredit,
    tierName,
    tierBonus,
    enableConversion,
    isEnabled,
    isLoading,
    error,
    fetchGiftCards,
    convertToGiftCard,
  };
}
