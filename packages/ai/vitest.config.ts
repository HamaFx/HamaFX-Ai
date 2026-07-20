import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      thresholds: {
        statements: 50,
        branches: 50,
        functions: 50,
        lines: 50,
      },
    },
    server: {
      deps: {
        inline: ['server-only'],
      },
    },
    alias: {
      'server-only': new URL('./test/__mocks__/server-only.ts', import.meta.url).pathname,
      '@ai': new URL('./src', import.meta.url).pathname,
    },
  },
});
