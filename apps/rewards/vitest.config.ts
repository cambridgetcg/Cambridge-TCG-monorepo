import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// A plain object, so vitest.postgres.config.ts can spread it and replace
// `include` (mergeConfig would concatenate the arrays).
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["test/unit/**/*.test.{ts,tsx}"],
    // Node by default; each *.dom.test.ts(x) starts with `// @vitest-environment jsdom`.
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    pool: "threads",
    poolOptions: {
      threads: { singleThread: true },
    },
  },
});
