import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
  BillingInterval,
  DeliveryMethod,
} from "@shopify/shopify-app-remix/server";
import { createDataAPISessionStorage } from "./utils/session-data-api-adapter";
import { syncCustomersInBackground } from "./services/background-customer-sync.server";
import { PRICING_PLANS } from "./constants/pricing-contract";

// Import and re-export billing plan names from shared constants
import {
  FREE_PLAN,
  PRO_PLAN,
  PRO_ANNUAL_PLAN,
  MAX_PLAN,
  MAX_ANNUAL_PLAN,
  ULTRA_PLAN,
  ULTRA_ANNUAL_PLAN,
  ENTERPRISE_PLAN,
  STARTER_PLAN,
  GROWTH_PLAN,
  MONTHLY_PLAN,
  ANNUAL_PLAN,
} from "./constants/plans";

// Re-export for backward compatibility
export {
  FREE_PLAN,
  PRO_PLAN,
  PRO_ANNUAL_PLAN,
  MAX_PLAN,
  MAX_ANNUAL_PLAN,
  ULTRA_PLAN,
  ULTRA_ANNUAL_PLAN,
  ENTERPRISE_PLAN,
  STARTER_PLAN,
  GROWTH_PLAN,
  MONTHLY_PLAN,
  ANNUAL_PLAN,
};

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: createDataAPISessionStorage(),
  distribution: AppDistribution.AppStore,
  // Manual Billing API compatibility catalogue. Every selectable current plan
  // is fixed recurring; legacy names remain only for subscription recognition.
  billing: {
    // Free plan - permanently free
    [FREE_PLAN]: {
      lineItems: [
        {
          amount: 0,
          currencyCode: 'USD',
          interval: BillingInterval.Every30Days,
        }
      ],
    },
    // Grow public plan. The stable Shopify name preserves legacy recognition.
    [PRO_PLAN]: {
      lineItems: [
        {
          amount: PRICING_PLANS.pro.monthlyPrice,
          currencyCode: 'USD',
          interval: BillingInterval.Every30Days,
        }
      ],
    },
    // Grow annual. Fixed recurring pricing means no surprise usage bill.
    [PRO_ANNUAL_PLAN]: {
      lineItems: [
        {
          amount: PRICING_PLANS.pro.annualPrice!,
          currencyCode: 'USD',
          interval: BillingInterval.Annual,
        }
      ],
    },
    // Scale public plan.
    [MAX_PLAN]: {
      lineItems: [
        {
          amount: PRICING_PLANS.max.monthlyPrice,
          currencyCode: 'USD',
          interval: BillingInterval.Every30Days,
        }
      ],
    },
    // Scale annual.
    [MAX_ANNUAL_PLAN]: {
      lineItems: [
        {
          amount: PRICING_PLANS.max.annualPrice!,
          currencyCode: 'USD',
          interval: BillingInterval.Annual,
        }
      ],
    },
    // Corporate public plan.
    [ULTRA_PLAN]: {
      lineItems: [
        {
          amount: PRICING_PLANS.ultra.monthlyPrice,
          currencyCode: 'USD',
          interval: BillingInterval.Every30Days,
        }
      ],
    },
    // Corporate annual.
    [ULTRA_ANNUAL_PLAN]: {
      lineItems: [
        {
          amount: PRICING_PLANS.ultra.annualPrice!,
          currencyCode: 'USD',
          interval: BillingInterval.Annual,
        }
      ],
    },
    // Enterprise is retained for private/manual legacy contracts.
    [ENTERPRISE_PLAN]: {
      lineItems: [
        {
          amount: PRICING_PLANS.enterprise.monthlyPrice,
          currencyCode: 'USD',
          interval: BillingInterval.Every30Days,
        }
      ],
    },
    // Starter plan - $29/month (legacy)
    [STARTER_PLAN]: {
      lineItems: [
        {
          amount: 29,
          currencyCode: 'USD',
          interval: BillingInterval.Every30Days,
        }
      ],
    },
    // Growth plan - $79/month (legacy)
    [GROWTH_PLAN]: {
      lineItems: [
        {
          amount: 79,
          currencyCode: 'USD',
          interval: BillingInterval.Every30Days,
        }
      ],
    },
    // Legacy plans - keeping for backward compatibility
    [MONTHLY_PLAN]: {
      lineItems: [
        {
          amount: 49,
          currencyCode: 'USD',
          interval: BillingInterval.Every30Days,
        }
      ],
    },
    [ANNUAL_PLAN]: {
      lineItems: [
        {
          amount: 490, // ~17% discount from monthly
          currencyCode: 'USD',
          interval: BillingInterval.Annual,
        }
      ],
    },
  },
  webhooks: {
    // Billing-related webhooks
    APP_SUBSCRIPTIONS_UPDATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/app-subscriptions-update",
    },
    APP_UNINSTALLED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/app/uninstalled",
    },
  },
  hooks: {
    afterAuth: async ({ session, admin }) => {
      console.log(`[AfterAuth] App installed/authenticated for shop: ${session.shop}`);

      // Import db here to avoid circular dependencies
      const db = (await import("./db.server")).default;

      // Valid currency codes from our Prisma enum
      const VALID_CURRENCIES = [
        'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'SEK', 'NZD',
        'NOK', 'MXN', 'SGD', 'HKD', 'KRW', 'TRY', 'INR', 'RUB', 'BRL', 'ZAR',
        'AED', 'PLN', 'DKK', 'THB', 'IDR', 'HUF', 'CZK', 'ILS', 'CLP', 'PHP'
      ];

      // Fetch shop details from Shopify (currency, timezone, name)
      let shopDetails: { currencyCode?: string; ianaTimezone?: string; name?: string; url?: string } = {};
      try {
        const shopQuery = `#graphql
          query getShopDetails {
            shop {
              name
              currencyCode
              ianaTimezone
              url
            }
          }
        `;
        const response = await admin.graphql(shopQuery);
        const shopData = await response.json();
        shopDetails = shopData.data?.shop || {};
        console.log(`[AfterAuth] Shopify shop details: currency=${shopDetails.currencyCode}, timezone=${shopDetails.ianaTimezone}`);
      } catch (error) {
        console.error(`[AfterAuth] Failed to fetch shop details from Shopify:`, error);
        // Continue with defaults
      }

      // Validate currency - only use if it's in our supported list
      const shopifyCurrency = VALID_CURRENCIES.includes(shopDetails.currencyCode || '')
        ? shopDetails.currencyCode
        : 'USD';

      // Check if ShopSettings exists
      let shopSettings = await db.shopSettings.findUnique({
        where: { shop: session.shop }
      });

      if (!shopSettings) {
        // First install - create ShopSettings with Shopify's currency
        console.log(`[AfterAuth] Creating ShopSettings for ${session.shop} with currency: ${shopifyCurrency}`);
        try {
          shopSettings = await db.shopSettings.create({
            data: {
              id: crypto.randomUUID(),
              shop: session.shop,
              storeName: shopDetails.name || session.shop.split('.')[0],
              storeUrl: shopDetails.url || `https://${session.shop}`,
              storeCurrency: shopifyCurrency,
              timezone: shopDetails.ianaTimezone || 'UTC',
              currencyDisplayType: 'SYMBOL',
              createdAt: new Date(),
              updatedAt: new Date(),
            }
          });
          console.log(`[AfterAuth] Created ShopSettings with currency: ${shopSettings.storeCurrency}`);
        } catch (createError) {
          console.error(`[AfterAuth] Failed to create ShopSettings:`, createError);
        }
      } else {
        // ShopSettings exists - check if currency needs updating
        // Only update if: currency is not set OR was defaulted to USD but Shopify reports different
        const currentCurrency = shopSettings.storeCurrency;
        const shouldUpdateCurrency = shopifyCurrency &&
          shopifyCurrency !== 'USD' &&
          currentCurrency === 'USD' &&
          shopifyCurrency !== currentCurrency;

        if (shouldUpdateCurrency) {
          console.log(`[AfterAuth] Updating currency from ${currentCurrency} to ${shopifyCurrency} for ${session.shop}`);
          try {
            await db.shopSettings.update({
              where: { shop: session.shop },
              data: {
                storeCurrency: shopifyCurrency,
                updatedAt: new Date()
              }
            });
            console.log(`[AfterAuth] Updated currency to ${shopifyCurrency}`);
          } catch (updateError) {
            console.error(`[AfterAuth] Failed to update currency:`, updateError);
          }
        }

        // Also update timezone if it differs
        if (shopDetails.ianaTimezone && shopSettings.timezone !== shopDetails.ianaTimezone) {
          try {
            await db.shopSettings.update({
              where: { shop: session.shop },
              data: {
                timezone: shopDetails.ianaTimezone,
                updatedAt: new Date()
              }
            });
            console.log(`[AfterAuth] Updated timezone to ${shopDetails.ianaTimezone}`);
          } catch (tzError) {
            console.error(`[AfterAuth] Failed to update timezone:`, tzError);
          }
        }
      }

      // Trigger customer sync if not completed
      if (!shopSettings?.customersInitialSynced) {
        console.log(`[AfterAuth] Starting initial customer sync for ${session.shop}`);
        syncCustomersInBackground(session.shop, admin).catch((error) => {
          console.error(`[AfterAuth] Customer sync failed for ${session.shop}:`, error);
        });
      } else {
        console.log(`[AfterAuth] Customers already synced for ${session.shop}, skipping re-sync`);
      }
    },
  },
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    removeRest: false, // Keep REST API for theme asset queries
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
