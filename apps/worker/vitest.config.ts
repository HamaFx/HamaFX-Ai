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
