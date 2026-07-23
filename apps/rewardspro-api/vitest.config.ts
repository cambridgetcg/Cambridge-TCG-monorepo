import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    clearMocks: true,
    coverage: {
      include: ["src/**/*.ts"],
      reporter: ["text", "json-summary"],
    },
    environment: "node",
    include: ["test/**/*.test.ts"],
    mockReset: true,
    restoreMocks: true,
  },
});
