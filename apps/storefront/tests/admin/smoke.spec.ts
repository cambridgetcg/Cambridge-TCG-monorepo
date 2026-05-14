/**
 * smoke.spec.ts — Generated route smoke test for storefront /admin/* routes
 *
 * Discovers every /admin/* route from the filesystem and asserts:
 *   1. The page returns HTTP 200
 *   2. No Next.js error boundary is visible ("Application error" or
 *      "Internal Server Error" text on-screen)
 *
 * Auth: navigates GET /api/dev-signin before each test (fast — just a
 *   DB write + session cookie). Available on localhost only; not on
 *   production (where the endpoint returns 404).
 *
 * To run:
 *   STOREFRONT_BASE_URL=http://localhost:3001 pnpm --filter cambridgetcg-storefront test:e2e
 * Or for a single route:
 *   STOREFRONT_BASE_URL=http://localhost:3001 pnpm --filter cambridgetcg-storefront test:e2e --grep "/admin/trust"
 */

import { test, expect, type Page } from "@playwright/test";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Route discovery — walks apps/storefront/src/app/admin/ for page.tsx files
// ---------------------------------------------------------------------------
const ADMIN_DIR = join(
  fileURLToPath(import.meta.url),
  "../../../src/app/admin",
);

function discoverRoutes(dir: string, prefix = "/admin"): string[] {
  const routes: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return routes;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    try {
      if (statSync(full).isDirectory()) {
        // Skip route-group directories (parenthesised) and dynamic segments
        // ([param]) — dynamic routes need seeded data and are not smoke-tested
        if (entry.startsWith("[")) continue;
        const segment = entry.startsWith("(") && entry.endsWith(")") ? "" : `/${entry}`;
        routes.push(...discoverRoutes(full, `${prefix}${segment}`));
      } else if (entry === "page.tsx" && prefix !== "/admin") {
        routes.push(prefix);
      }
    } catch {
      // ignore
    }
  }
  return routes;
}

const ROUTES = [...new Set(discoverRoutes(ADMIN_DIR))].sort();

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------
async function devSignIn(page: Page): Promise<void> {
  await page.goto("/api/dev-signin");
  // dev-signin redirects to /overview — confirm we're authed
  await expect(page).toHaveURL(/\/overview/, { timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Smoke tests — one per route
// ---------------------------------------------------------------------------
test.describe("Admin smoke — all /admin/* routes", () => {
  for (const route of ROUTES) {
    test(`${route} → 200, no error boundary`, async ({ page }) => {
      await devSignIn(page);
      const response = await page.goto(route);

      // HTTP status
      expect(response?.status(), `${route} returned non-200`).toBe(200);

      // No Next.js / React error boundary visible
      await expect(
        page.getByText("Application error: a client-side exception has occurred"),
        `${route} shows client-side error boundary`,
      ).not.toBeVisible({ timeout: 5_000 });

      await expect(
        page.getByText("Internal Server Error"),
        `${route} shows Internal Server Error`,
      ).not.toBeVisible({ timeout: 2_000 });

      // Page has a <title> (catches blank / mis-wired pages)
      const title = await page.title();
      expect(title, `${route} has no page title`).not.toBe("");
      expect(title, `${route} title is generic "Cambridge TCG"`)
        .not.toBe("Cambridge TCG");
    });
  }
});
