/**
 * The Shopify app: shopifyApp() and the parts the routes use.
 *
 * It sits at app/shopify.server.ts, the template's location, so the
 * template's relative imports keep working. Sessions are stored encrypted
 * (shopify/session-storage.server.ts). Offline tokens expire: the library
 * refreshes a token within 5 minutes of expiry on webhook, proxy and
 * unauthenticated paths, and admin requests exchange a new one, which runs
 * `hooks.afterAuth` again. Webhook subscriptions live only in the app's toml.
 */
import "@shopify/shopify-app-react-router/adapters/node";
import { ApiVersion, AppDistribution, shopifyApp } from "@shopify/shopify-app-react-router/server";
import prisma from "./db.server";
import { onAppOpened } from "./shopify/install.server";
import { EncryptedPrismaSessionStorage } from "./shopify/session-storage.server";

// The same URL as on AppProvider, so the preload header and the page load one bundle.
const POLARIS_URL = "https://cdn.shopify.com/shopifycloud/polaris-2.js";

// An extra shop domain to accept, a regular-expression fragment as before
// (`customShopDomains` in library 1.1 and earlier; `domainTransformations`
// now). The shop is accepted as it is, not rewritten.
const customShopDomain = process.env.SHOP_CUSTOM_DOMAIN;

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new EncryptedPrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  polarisUrl: POLARIS_URL,
  hooks: {
    afterAuth: onAppOpened,
  },
  ...(customShopDomain
    ? {
        domainTransformations: [
          {
            match: new RegExp(`^[a-zA-Z0-9][a-zA-Z0-9-_]*\\.${customShopDomain}$`),
            transform: (matches: RegExpMatchArray) => matches[0],
          },
        ],
      }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const sessionStorage = shopify.sessionStorage;
