import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // NextAuth v5 imports `next/server` (no extension) which vitest's
    // strict ESM resolver rejects — Next.js webpack tolerates it but
    // vitest does not. Inlining the package tells vitest to process
    // next-auth with its own loader and follow the extension properly.
    server: {
      deps: {
        inline: ['next-auth', '@auth/drizzle-adapter'],
      },
    },
  },
});
