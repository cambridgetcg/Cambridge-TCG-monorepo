import { defineConfig, devices } from "@playwright/test";

/**
 * Cambridge TCG Storefront — Playwright configuration
 *
 * Runs against a live storefront. Set STOREFRONT_BASE_URL to target a
 * specific environment (default: production at cambridgetcg.com).
 *
 *   STOREFRONT_BASE_URL=http://localhost:3001 pnpm test:e2e
 *   STOREFRONT_BASE_URL=https://cambridgetcg.com pnpm test:e2e
 *
 * Specs that send a real magic-link email (auth-magic-link.spec.ts) are
 * gated on STOREFRONT_TEST_EMAIL + DATABASE_URL — without both, those
 * tests skip. See apps/storefront/tests/README for the e2e contract.
 */

const baseURL = process.env.STOREFRONT_BASE_URL ?? "https://cambridgetcg.com";

export default defineConfig({
  testDir: "./tests",
  outputDir: "../../playwright-output/storefront",

  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 1,

  reporter: [
    ["list"],
    ["html", { outputFolder: "../../playwright-output/storefront-html", open: "never" }],
  ],

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
