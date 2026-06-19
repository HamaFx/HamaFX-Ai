/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
    // Polyfill `crypto.subtle` so Edge-only auth code can be tested in
    // Node. See ./test/vitest.setup.ts for the rationale.
    setupFiles: ['./test/vitest.setup.ts'],
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
