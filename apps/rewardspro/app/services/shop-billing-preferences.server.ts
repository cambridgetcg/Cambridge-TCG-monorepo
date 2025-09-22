/**
 * Shop Billing Preferences Service
 *
 * Queries and stores merchant billing currency and other preferences from Shopify.
 * This helps determine the primary currency for tier calculations and reporting.
 */

import type { Currency } from '@prisma/client';
import type { AdminApiContext } from '@shopify/shopify-app-remix/server';
import db from '~/db.server';
import { validateCurrency } from './currency-validation.server';

// ============================================================================
// TYPES
// ============================================================================

export interface ShopBillingPreferences {
  shop: string;
  currencyCode: Currency;
  enabledPresentmentCurrencies: Currency[];
  primaryMarket: {
    id: string;
    name: string;
    currencyCode: Currency;
  } | null;
  billingAddress?: {
    country: string;
    countryCode: string;
  };
  timezone: string;
}

// ============================================================================
// GRAPHQL QUERIES
// ============================================================================

const SHOP_PREFERENCES_QUERY = `#graphql
  query GetShopBillingPreferences {
    shop {
      id
      name
      email
      currencyCode
      enabledPresentmentCurrencies
      primaryDomain {
        url
      }
      billingAddress {
        country
        countryCode
      }
      timezoneAbbreviation
      timezoneOffset
      timezoneOffsetMinutes
      ianaTimezone
      plan {
        displayName
        partnerDevelopment
        shopifyPlus
      }
    }

    # Get primary market for currency info
    markets(first: 1, primary: true) {
      nodes {
        id
        name
        primary
        currencySettings {
          baseCurrency {
            currencyCode
            currencyName
          }
          localCurrencies
        }
      }
    }

    # Get app subscription info for billing currency
    currentAppInstallation {
      id
      launchDate

      # Note: activeSubscriptions might not include billing currency
      # but we can infer from the shop's country/currency
      activeSubscriptions {
        id
        name
        currentPeriodEnd
        test
        status
      }
    }
  }
`;

// For shops with Shopify Payments enabled, we can also query:
const SHOPIFY_PAYMENTS_QUERY = `#graphql
  query GetShopifyPaymentsAccount {
    shopifyPaymentsAccount {
      id
      country
      defaultCurrency
      supportedCurrencies
      balance {
        currency
        amount
      }
    }
  }
`;

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class ShopBillingPreferencesService {
  private admin: AdminApiContext;
  private shop: string;

  constructor(admin: AdminApiContext, shop: string) {
    this.admin = admin;
    this.shop = shop;
  }

  /**
   * Query and update shop billing preferences
   */
  async updateBillingPreferences(): Promise<ShopBillingPreferences> {
    try {
      // Query shop preferences from Shopify
      const response = await this.admin.graphql(SHOP_PREFERENCES_QUERY);
      const data = await response.json();

      if (data.errors) {
        console.error('[ShopBilling] GraphQL errors:', data.errors);
        throw new Error('Failed to query shop preferences');
      }

      const shop = data.data.shop;
      const primaryMarket = data.data.markets?.nodes?.[0];

      // Validate and normalize currency
      const currencyValidation = validateCurrency(shop.currencyCode);
      if (!currencyValidation.isValid) {
        console.warn(
          `[ShopBilling] Shop ${this.shop} has unsupported currency: ${shop.currencyCode}`
        );
      }

      const primaryCurrency = currencyValidation.currency;

      // Validate enabled presentment currencies
      const enabledCurrencies = shop.enabledPresentmentCurrencies
        .map((code: string) => validateCurrency(code))
        .filter((v: any) => v.isValid)
        .map((v: any) => v.currency);

      // Determine primary market currency
      let marketCurrency = primaryCurrency;
      if (primaryMarket?.currencySettings?.baseCurrency?.currencyCode) {
        const marketValidation = validateCurrency(
          primaryMarket.currencySettings.baseCurrency.currencyCode
        );
        if (marketValidation.isValid) {
          marketCurrency = marketValidation.currency;
        }
      }

      // Update shop settings in database
      await this.updateShopSettings({
        shop: this.shop,
        storeName: shop.name,
        storeUrl: shop.primaryDomain?.url || `https://${this.shop}`,
        storeCurrency: primaryCurrency,
        enabledCurrencies,
        marketCurrency,
        timezone: shop.ianaTimezone || 'UTC',
        billingCountry: shop.billingAddress?.countryCode,
      });

      // Try to get Shopify Payments info if available
      await this.queryShopifyPayments().catch(error => {
        // Shopify Payments might not be available for all shops
        console.log('[ShopBilling] Shopify Payments not available:', error.message);
      });

      return {
        shop: this.shop,
        currencyCode: primaryCurrency,
        enabledPresentmentCurrencies: enabledCurrencies,
        primaryMarket: primaryMarket
          ? {
              id: primaryMarket.id,
              name: primaryMarket.name,
              currencyCode: marketCurrency,
            }
          : null,
        billingAddress: shop.billingAddress,
        timezone: shop.ianaTimezone || 'UTC',
      };
    } catch (error) {
      console.error('[ShopBilling] Failed to update preferences:', error);
      throw error;
    }
  }

  /**
   * Query Shopify Payments account (if available)
   */
  private async queryShopifyPayments(): Promise<void> {
    try {
      const response = await this.admin.graphql(SHOPIFY_PAYMENTS_QUERY);
      const data = await response.json();

      if (data.data?.shopifyPaymentsAccount) {
        const account = data.data.shopifyPaymentsAccount;

        // Validate payment currency
        const paymentCurrencyValidation = validateCurrency(account.defaultCurrency);

        if (paymentCurrencyValidation.isValid) {
          console.log(
            `[ShopBilling] Shop ${this.shop} uses ${account.defaultCurrency} for payments`
          );

          // You could store this separately or use it to confirm billing currency
          // For now, we'll just log it
        }
      }
    } catch (error) {
      // Shopify Payments is not available for all shops
      throw error;
    }
  }

  /**
   * Update shop settings in database
   */
  private async updateShopSettings(params: {
    shop: string;
    storeName: string;
    storeUrl: string;
    storeCurrency: Currency;
    enabledCurrencies: Currency[];
    marketCurrency: Currency;
    timezone: string;
    billingCountry?: string;
  }): Promise<void> {
    const {
      shop,
      storeName,
      storeUrl,
      storeCurrency,
      enabledCurrencies,
      marketCurrency,
      timezone,
      billingCountry,
    } = params;

    await db.shopSettings.upsert({
      where: { shop },
      update: {
        storeName,
        storeUrl,
        storeCurrency,
        timezone,
        metadata: {
          enabledCurrencies,
          marketCurrency,
          billingCountry,
          lastSyncedAt: new Date(),
        },
        updatedAt: new Date(),
      },
      create: {
        id: crypto.randomUUID(),
        shop,
        storeName,
        storeUrl,
        storeCurrency,
        currencyDisplayType: 'SYMBOL',
        timezone,
        metadata: {
          enabledCurrencies,
          marketCurrency,
          billingCountry,
          lastSyncedAt: new Date(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log(`[ShopBilling] Updated settings for ${shop}:`, {
      currency: storeCurrency,
      enabledCurrencies: enabledCurrencies.length,
      marketCurrency,
      timezone,
    });
  }

  /**
   * Get cached billing preferences
   */
  async getCachedPreferences(): Promise<ShopBillingPreferences | null> {
    const settings = await db.shopSettings.findUnique({
      where: { shop: this.shop },
    });

    if (!settings) {
      return null;
    }

    const metadata = settings.metadata as any || {};

    return {
      shop: this.shop,
      currencyCode: settings.storeCurrency,
      enabledPresentmentCurrencies: metadata.enabledCurrencies || [settings.storeCurrency],
      primaryMarket: metadata.marketCurrency
        ? {
            id: 'primary',
            name: 'Primary Market',
            currencyCode: metadata.marketCurrency,
          }
        : null,
      billingAddress: metadata.billingCountry
        ? {
            country: metadata.billingCountry,
            countryCode: metadata.billingCountry,
          }
        : undefined,
      timezone: settings.timezone,
    };
  }

  /**
   * Check if preferences need update
   */
  async needsUpdate(): Promise<boolean> {
    const settings = await db.shopSettings.findUnique({
      where: { shop: this.shop },
    });

    if (!settings) {
      return true;
    }

    const metadata = settings.metadata as any || {};
    const lastSyncedAt = metadata.lastSyncedAt;

    if (!lastSyncedAt) {
      return true;
    }

    // Update if older than 24 hours
    const hoursSinceSync = (Date.now() - new Date(lastSyncedAt).getTime()) / (1000 * 60 * 60);
    return hoursSinceSync > 24;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Update shop billing preferences
 */
export async function updateShopBillingPreferences(
  admin: AdminApiContext,
  shop: string
): Promise<ShopBillingPreferences> {
  const service = new ShopBillingPreferencesService(admin, shop);
  return service.updateBillingPreferences();
}

/**
 * Get shop billing preferences (cached or fresh)
 */
export async function getShopBillingPreferences(
  admin: AdminApiContext,
  shop: string,
  forceRefresh = false
): Promise<ShopBillingPreferences> {
  const service = new ShopBillingPreferencesService(admin, shop);

  if (!forceRefresh) {
    const cached = await service.getCachedPreferences();
    if (cached) {
      // Check if update is needed in background
      service.needsUpdate().then(needsUpdate => {
        if (needsUpdate) {
          service.updateBillingPreferences().catch(console.error);
        }
      });
      return cached;
    }
  }

  return service.updateBillingPreferences();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  ShopBillingPreferencesService,
  updateShopBillingPreferences,
  getShopBillingPreferences,
};