import { resolve } from "node:path";
import { UNSAFE_flatRoutes } from "@remix-run/dev";
import { describe, expect, it } from "vitest";

/**
 * Routes removed because they were unsafe. Bringing one back needs the fix
 * named here, not just the file.
 */
const REMOVED: Record<string, string> = {
  // Any installed merchant could read every shop's Sentry issues
  "routes/api.sentry-events": "cross-shop data exposure",
  // Reflected XSS through ?shop=; nothing links to it and paid plans are retired
  "routes/api.billing.callback": "reflected XSS",
  // Internal diagnostics open to any merchant
  "routes/app.debug": "debug surface",
  // Deleted every session on any shop change; never subscribed
  "routes/webhooks.shop.update": "destructive webhook",
};

describe("removed routes", () => {
  const manifest = UNSAFE_flatRoutes(resolve(process.cwd(), "app"), ["**/.*"], "routes");

  it("reads the route manifest", () => {
    expect(manifest["routes/api.health"]).toBeDefined();
  });

  it.each(Object.entries(REMOVED))("%s stays removed (%s)", (id) => {
    expect(manifest[id]).toBeUndefined();
  });
});
