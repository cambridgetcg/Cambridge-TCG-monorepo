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
import { POLARIS_URL } from "./shopify/polaris";
import { RenewalBusyError } from "./shopify/renewal-busy";
import { EncryptedPrismaSessionStorage, oneRenewalCall } from "./shopify/session-storage.server";

// An extra shop domain to accept, a regular-expression fragment as before
// (`customShopDomains` in library 1.1 and earlier; `domainTransformations`
// now). The shop is accepted as it is, not rewritten.
//
// Required shape: an escaped literal domain such as `shops\.example\.test`,
// with no alternation (`a|b`), optional groups (`(x)?`) or other regex
// syntax. shopify-api 15's getTransformationDomains reads the domain back
// out of this pattern for sanitizeShop's allow-list and silently drops any
// shape it can't parse (logged at debug level only), so a richer fragment
// matches here yet its shops are still rejected as invalid. The
// contract stays a regex fragment because the old app reads the same env
// name, possibly in the same Vercel project.
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

/**
 * `fn`, answering 503 while another renewal of the delivery's store token
 * runs (RenewalBusyError, Ruling 85): Shopify delivers the webhook again.
 */
function tryLaterWhileRenewing<F extends (...args: never[]) => Promise<unknown>>(fn: F): F {
  return (async (...args: Parameters<F>) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof RenewalBusyError) throw new Response(null, { status: 503 });
      throw error;
    }
  }) as F;
}

// Each entry point that can renew the offline token runs as one renewal call,
// so the session it stores releases only the renewal lease it took (Ruling
// 39). Only the admin renews an expired token beside a running renewal; the
// webhook, the proxy and the jobs' unauthenticated.admin answer try-later
// (Ruling 85): unauthenticated.admin and the proxy throw RenewalBusyError for
// their callers to handle.
export const authenticate: typeof shopify.authenticate = {
  ...shopify.authenticate,
  admin: oneRenewalCall(shopify.authenticate.admin, "admin"),
  webhook: tryLaterWhileRenewing(oneRenewalCall(shopify.authenticate.webhook, "background")),
  public: { ...shopify.authenticate.public, appProxy: oneRenewalCall(shopify.authenticate.public.appProxy, "background") },
};
export const unauthenticated: typeof shopify.unauthenticated = {
  ...shopify.unauthenticated,
  admin: oneRenewalCall(shopify.unauthenticated.admin, "background"),
};
export const login = shopify.login;
export const sessionStorage = shopify.sessionStorage;
