import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      thresholds: {
        statements: 38,
        branches: 70,
        functions: 74,
        lines: 38,
      },
    },
    alias: {
      'server-only': new URL('./test/empty.ts', import.meta.url).pathname,
    },
  },
});
