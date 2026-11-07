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
    // The library's React half (AppProvider) is run through Vite like the
    // test itself, so both use one copy of react-router: loaded natively, it
    // would get its own, and its useNavigate would find no router in a
    // *.dom.test. The server half stays external.
    server: {
      deps: {
        inline: [/@shopify\/shopify-app-react-router\/dist\/esm\/react\//],
      },
    },
    pool: "threads",
    poolOptions: {
      threads: { singleThread: true },
    },
  },
});
