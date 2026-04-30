import { defineConfig, devices } from "@playwright/test";

/**
 * Cambridge TCG Admin — Playwright configuration
 *
 * Runs against a live admin server. Set ADMIN_BASE_URL to target a
 * specific environment (dev server, Vercel preview, or production).
 *
 * Local dev:
 *   1. Start the server:  pnpm --filter @cambridge-tcg/admin dev
 *   2. Run tests:         pnpm --filter @cambridge-tcg/admin test:e2e
 *
 * CI: set ADMIN_BASE_URL to the Vercel preview URL, ADMIN_TEST_TOKEN
 * for cookie auth (long-lived service-account session).
 *
 * See: apps/admin/CLAUDE.md — "Testing"
 */

const baseURL = process.env.ADMIN_BASE_URL ?? "http://localhost:3002";

export default defineConfig({
  testDir: "./tests",
  outputDir: "../../playwright-output/admin",

  // Each test is independent — don't share state between files
  fullyParallel: false,

  // Fail the build on test.only — CI safety
  forbidOnly: !!process.env.CI,

  // No retries locally; 1 retry in CI for flakiness tolerance
  retries: process.env.CI ? 1 : 0,

  // Run 1 worker locally (most tests share the dev server session);
  // 2 in CI (faster but tests must be independent, which they are)
  workers: process.env.CI ? 2 : 1,

  reporter: [
    ["list"],
    ["html", { outputFolder: "../../playwright-output/admin-html", open: "never" }],
  ],

  use: {
    baseURL,

    // Capture traces on first retry so CI failures are debuggable
    trace: "on-first-retry",

    // Screenshot on failure
    screenshot: "only-on-failure",

    // Viewport for an internal admin tool — standard desktop
    viewport: { width: 1440, height: 900 },
  },

  projects: [
    // Chromium-only: admin is an internal tool, not cross-browser
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // No webServer auto-start: tests assume the server is already running.
  // (CI starts the server separately before running tests, or points at
  //  the Vercel preview URL via ADMIN_BASE_URL.)
});
