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
        // Global floor — enforce, not just report. Current ~59% stmts/lines.
        statements: 55,
        branches: 70,
        functions: 60,
        lines: 55,
        // Core orchestration must never silently regress below ~80%.
        'src/agent.ts': { statements: 80, branches: 60, functions: 90, lines: 80 },
        'src/multi-agent/orchestrator.ts': { statements: 80, branches: 60, functions: 90, lines: 80 },
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
