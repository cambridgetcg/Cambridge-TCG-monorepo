import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.config";

// The Postgres suites. They need the migrated database that
// `scripts/test-db.sh start` prints as REWARDS_TEST_DATABASE_URL.
// The base config is spread, not mergeConfig'd: mergeConfig concatenates
// arrays, which would pull the unit tests into `include`. Everything else is
// the base's: test/setup.ts (MSW, env) and one file at a time, which these
// suites need because every test truncates every table.
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ["test/postgres/**/*.postgres.test.ts"],
    setupFiles: [...[baseConfig.test?.setupFiles ?? []].flat(), "./test/postgres/helpers/env.ts"],
    // A database test that only passes on retry is a real failure.
    retry: 0,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
