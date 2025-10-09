/**
 * Custom hook for multi-currency formatting
 *
 * Uses PaymentSettings API to get shop currency configuration
 * Falls back to USD if currency cannot be determined
 */

import { useEffect, useState } from 'react';
import { useApi } from '@shopify/ui-extensions-react/customer-account';

interface CurrencySettings {
  currencyCode: string;
  formatter: Intl.NumberFormat;
}

const currencyCache = new Map<string, CurrencySettings>();

export function useCurrency() {
  const { query } = useApi();
  const [currency, setCurrency] = useState<CurrencySettings>({
    currencyCode: 'USD',
    formatter: new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }),
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function fetchCurrency() {
      try {
        // Check cache first
        const cached = currencyCache.get('shop_currency');
        if (cached) {
          if (mounted) {
            setCurrency(cached);
            setLoading(false);
          }
          return;
        }

        // Query PaymentSettings for shop currency
        const result = await query<{
          paymentSettings: {
            currencyCode: string;
          };
        }>(
          `query {
            paymentSettings {
              currencyCode
            }
          }`
        );

        if (result?.data?.paymentSettings?.currencyCode) {
          const currencyCode = result.data.paymentSettings.currencyCode;
          const formatter = new Intl.NumberFormat(navigator.language, {
            style: 'currency',
            currency: currencyCode,
          });

          const settings = { currencyCode, formatter };

          // Cache for future use
          currencyCache.set('shop_currency', settings);

          if (mounted) {
            setCurrency(settings);
          }
        }
      } catch (error) {
        console.error('Failed to fetch currency settings:', error);
        // Keep default USD formatter
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchCurrency();

    return () => {
      mounted = false;
    };
  }, [query]);

  /**
   * Format amount as currency string
   */
  const formatCurrency = (amount: number): string => {
    return currency.formatter.format(amount);
  };

  /**
   * Format amount with custom options
   */
  const formatAmount = (
    amount: number,
    options?: Intl.NumberFormatOptions
  ): string => {
    const formatter = new Intl.NumberFormat(navigator.language, {
      style: 'currency',
      currency: currency.currencyCode,
      ...options,
    });
    return formatter.format(amount);
  };

  return {
    currencyCode: currency.currencyCode,
    formatCurrency,
    formatAmount,
    loading,
  };
}
