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
  USAGE_PLAN,
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
  USAGE_PLAN,
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
  // Billing configuration for managed pricing
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
    // Pro plan - $39/month + usage charges
    [PRO_PLAN]: {
      lineItems: [
        {
          amount: 39,
          currencyCode: 'USD',
          interval: BillingInterval.Every30Days,
        },
        {
          amount: 200, // Usage cap
          currencyCode: 'USD',
          interval: BillingInterval.Usage,
          terms: "$10 per 100 additional orders over 500 orders/month (max $200/month)"
        }
      ],
      trialDays: 7,
    },
    // Pro Annual - $336/year (28% discount - save $132/year) + usage charges
    // Monthly equivalent: $28/month
    [PRO_ANNUAL_PLAN]: {
      lineItems: [
        {
          amount: 336,
          currencyCode: 'USD',
          interval: BillingInterval.Annual,
        },
        {
          amount: 200, // Usage cap
          currencyCode: 'USD',
          interval: BillingInterval.Usage,
          terms: "$10 per 100 additional orders over 500 orders/month (max $200/month)"
        }
      ],
      trialDays: 7,
    },
    // Max plan - $149/month + usage charges
    [MAX_PLAN]: {
      lineItems: [
        {
          amount: 149,
          currencyCode: 'USD',
          interval: BillingInterval.Every30Days,
        },
        {
          amount: 500, // Usage cap
          currencyCode: 'USD',
          interval: BillingInterval.Usage,
          terms: "$5 per 100 additional orders over 2,000 orders/month (max $500/month)"
        }
      ],
      trialDays: 7,
    },
    // Max Annual - $1,296/year (27% discount - save $492/year) + usage charges
    // Monthly equivalent: $108/month
    [MAX_ANNUAL_PLAN]: {
      lineItems: [
        {
          amount: 1296,
          currencyCode: 'USD',
          interval: BillingInterval.Annual,
        },
        {
          amount: 500, // Usage cap
          currencyCode: 'USD',
          interval: BillingInterval.Usage,
          terms: "$5 per 100 additional orders over 2,000 orders/month (max $500/month)"
        }
      ],
      trialDays: 7,
    },
    // Ultra plan - $499/month (unlimited everything - no usage charges)
    [ULTRA_PLAN]: {
      lineItems: [
        {
          amount: 499,
          currencyCode: 'USD',
          interval: BillingInterval.Every30Days,
        }
      ],
      trialDays: 14,
    },
    // Ultra Annual - $4,296/year (28% discount - save $1,692/year)
    // Monthly equivalent: $358/month (unlimited everything - no usage charges)
    [ULTRA_ANNUAL_PLAN]: {
      lineItems: [
        {
          amount: 4296,
          currencyCode: 'USD',
          interval: BillingInterval.Annual,
        }
      ],
      trialDays: 14,
    },
    // Enterprise plan - Custom pricing (placeholder - actual pricing negotiated)
    [ENTERPRISE_PLAN]: {
      lineItems: [
        {
          amount: 999, // Placeholder - custom pricing negotiated per client
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
    // Usage-based billing for overages
    [USAGE_PLAN]: {
      lineItems: [
        {
          amount: 0.01, // Per order overage charge
          currencyCode: 'USD',
          interval: BillingInterval.Usage,
          terms: "Per order overage charge",
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
    APP_SUBSCRIPTIONS_APPROACHING_CAPPED_AMOUNT: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/subscriptions/approaching-cap",
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

      // Check if initial sync already completed
      const shopSettings = await db.shopSettings.findUnique({
        where: { shop: session.shop }
      });

      if (!shopSettings?.customersInitialSynced) {
        // First install or sync not completed - trigger sync
        console.log(`[AfterAuth] Starting initial customer sync for ${session.shop}`);

        syncCustomersInBackground(session.shop, admin).catch((error) => {
          console.error(`[AfterAuth] Customer sync failed for ${session.shop}:`, error);
        });
      } else {
        // Re-auth - customers already synced
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
