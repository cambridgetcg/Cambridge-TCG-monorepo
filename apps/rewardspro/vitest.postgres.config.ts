import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

// Postgres-backed integration tests. They need a migrated database named by
// REWARDSPRO_TEST_DATABASE_URL; see docs/DATABASE.md ("Integration tests").
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ["test/integration/postgres/**/*.integration.test.ts"],
      environment: "node",
      setupFiles: ["./test/integration/postgres/env.ts"],
      // A database test that only passes on retry is a real failure
      retry: 0,
      testTimeout: 30000,
      hookTimeout: 30000,
    },
  }),
);
