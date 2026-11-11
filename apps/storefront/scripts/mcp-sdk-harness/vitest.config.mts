// Runs only the SDK harness (sdk-vs-route.test.ts), by hand; the app's own
// suite (vitest.config.ts) reads src/ and never this folder.
import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  root: app,
  test: {
    environment: "node",
    globals: true,
    include: ["scripts/mcp-sdk-harness/*.test.ts"],
    testTimeout: 60_000,
    // Each case prints what it saw, requests and statuses included.
    silent: false,
  },
  resolve: {
    alias: { "@": path.join(app, "src") },
  },
});
