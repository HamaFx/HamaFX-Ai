import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './test/empty.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/index.ts',
        'src/app/**/layout.tsx',
        'src/app/**/loading.tsx',
        'src/app/**/page.tsx',
      ],
      // PF-20 — Raised from 30/25/25/30 to 50/50/50/50 to match
      // the other packages (ai, db, shared all target 50+).
      thresholds: {
        statements: 50,
        branches: 50,
        functions: 50,
        lines: 50,
      },
    },
    server: {
      deps: {
        inline: ['next-auth', '@auth/drizzle-adapter'],
      },
    },
  },
});
