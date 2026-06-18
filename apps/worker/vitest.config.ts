import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // `server-only` is a build-time guard that throws if any client bundle
    // pulls in a server-only module. In vitest (Node) we don't care about
    // that distinction — aliasing the import to an empty module keeps the
    // production build's safety net intact while letting worker tests load
    // modules that transitively import `server-only` via the shared barrel.
    alias: {
      'server-only': new URL('./test/empty.ts', import.meta.url).pathname,
    },
  },
});
