import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
  BillingInterval,
} from "@shopify/shopify-app-remix/server";
import { createDataAPISessionStorage } from "./utils/session-data-api-adapter";

// Define billing plan names (should match Partner Dashboard configuration)
export const FREE_PLAN = "RewardsPro Free Trial";
export const MONTHLY_PLAN = "RewardsPro Monthly";
export const ANNUAL_PLAN = "RewardsPro Annual";
export const USAGE_PLAN = "RewardsPro Usage";

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
    // Free trial plan - 14 days free, then converts to monthly
    [FREE_PLAN]: {
      lineItems: [
        {
          amount: 49,
          currencyCode: 'USD',
          interval: BillingInterval.Every30Days,
        }
      ],
      trialDays: 14, // 14-day free trial
    },
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
        }
      ],
    },
  },
  webhooks: {
    // Billing-related webhooks
    APP_SUBSCRIPTIONS_UPDATE: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks/subscriptions/update",
    },
    APP_SUBSCRIPTIONS_APPROACHING_CAPPED_AMOUNT: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks/subscriptions/approaching-cap",
    },
    APP_UNINSTALLED: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks/app/uninstalled",
    },
  },
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    removeRest: true,
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
