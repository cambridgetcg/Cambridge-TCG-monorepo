/**
 * App Bridge in every document (Built for Shopify 3.1.1): Shopify's
 * app-bridge.js from its CDN, with the app's key in a `shopify-api-key` meta
 * tag, as the first script in <head>, never async, defer or a module
 * (App Bridge stops with an error otherwise). The URL carries no version, so
 * it always serves the latest App Bridge. root.tsx's Layout renders the tags,
 * so the admin's pages, both error pages and React Router's own 404 all load
 * it, once.
 *
 * Not a .server module: Layout renders on the server and again in the
 * browser, which must render the same tags (hydration).
 */
export const APP_BRIDGE_URL = "https://cdn.shopify.com/shopifycloud/app-bridge.js";

/** What a document's head tells App Bridge. */
export type AppBridgeHead = {
  /** The app's client id, SHOPIFY_API_KEY: public, not a secret. */
  apiKey: string;
  /** Log the admin's Web Vitals (LCP, CLS, INP) in the console: never in production. */
  webVitalsDebug: boolean;
};

/**
 * On the server, from the environment, in every document: a 404 that React
 * Router answers itself runs no loader, so a loader can't hand the key over
 * there. Web Vitals are logged only where the environment names a place
 * that isn't production: a Vercel preview or `vercel dev` (VERCEL_ENV), or,
 * off Vercel, a development server (NODE_ENV "development", which the Vite
 * server under `shopify app dev`, how staging runs, sets when it's unset).
 * Anything else, an unknown environment too, counts as production.
 */
export function appBridgeHead(env: Record<string, string | undefined>): AppBridgeHead {
  const webVitalsDebug = env.VERCEL_ENV
    ? env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "development"
    : env.NODE_ENV === "development";
  return { apiKey: env.SHOPIFY_API_KEY || "", webVitalsDebug };
}

/** In the browser, what the server rendered, so hydration renders the same tags. */
export function renderedAppBridgeHead(document: Document): AppBridgeHead {
  return {
    apiKey: document.querySelector<HTMLMetaElement>('meta[name="shopify-api-key"]')?.content ?? "",
    webVitalsDebug: document.querySelector('meta[name="shopify-debug"]') !== null,
  };
}
