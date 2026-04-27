/** Host-detection utilities — single source of truth for subdomain routing. */

const ADMIN_HOSTS = new Set(["admin.wholesaletcgdirect.com", "admin.localhost"]);

const STOREFRONT_HOSTS = new Set([
  "wholesaletcgdirect.com",
  "www.wholesaletcgdirect.com",
  "localhost",
]);

export function stripPort(host: string): string {
  return host.replace(/:\d+$/, "");
}

export function isAdminHost(host: string): boolean {
  return ADMIN_HOSTS.has(stripPort(host));
}

export function isStorefrontHost(host: string): boolean {
  return STOREFRONT_HOSTS.has(stripPort(host));
}

/** Vercel preview deploys — skip domain gating so all routes work. */
export function isPreviewDeploy(host: string): boolean {
  return stripPort(host).endsWith(".vercel.app");
}
