/**
 * The Polaris web-components script. shopifyApp's `polarisUrl` (the preload
 * header) and every page that loads the script use this one URL, so the
 * header and the page load the same bundle. It is not a .server module, so
 * route components can render it.
 */
export const POLARIS_URL = "https://cdn.shopify.com/shopifycloud/polaris-2.js";
