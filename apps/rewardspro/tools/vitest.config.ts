import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules'],
    globals: false,
    environment: 'node',
    // Don't inherit setup from parent
    setupFiles: [],
  },
});
