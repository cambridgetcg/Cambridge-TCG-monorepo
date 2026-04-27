import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://wholesaletcgdirect.com",
    headless: true,
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 375, height: 812 },
      },
    },
  ],
});
