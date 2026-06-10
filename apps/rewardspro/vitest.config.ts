import { defineConfig } from "vitest/config";
import { resolve } from "path";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "jsdom", // Changed to jsdom for React component testing
    setupFiles: ["./test/setup/vitest.setup.ts"],
    environmentMatchGlobs: [
      // Use jsdom for component tests
      ["**/*.component.test.{ts,tsx}", "jsdom"],
      ["**/*.ui.test.{ts,tsx}", "jsdom"],
      // Use node for server-side tests
      ["**/*.server.test.{ts,tsx}", "node"],
      ["**/routes/**/*.test.{ts,tsx}", "node"],
      ["**/services/**/*.test.{ts,tsx}", "node"],
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: [
        "node_modules/",
        "test/",
        "*.config.{ts,js}",
        "build/",
        ".vercel/",
        "public/",
        "app/entry.*.tsx",
        "app/root.tsx",
        "**/*.d.ts",
        "**/__mocks__/**",
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
    // Test execution settings
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: true, // Run tests serially for better isolation
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    retry: 1,
    reporters: ["default", "html"],
    outputFile: {
      html: "./test-results/index.html",
    },
  },
  resolve: {
    alias: {
      "~": resolve(__dirname, "./app"),
    },
  },
});