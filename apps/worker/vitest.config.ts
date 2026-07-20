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
        statements: 50,
        branches: 70,
        functions: 80,
        lines: 50,
      },
    },
    alias: {
      'server-only': new URL('./test/empty.ts', import.meta.url).pathname,
    },
  },
});
