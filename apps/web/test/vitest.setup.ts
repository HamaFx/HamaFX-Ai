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

// Vitest setup — polyfills the Edge `crypto` global so Edge-only auth
// code (`apps/web/src/lib/auth.ts`, which uses `crypto.subtle`) can run
// in Node test environments. The polyfill is `node:crypto.webcrypto`,
// which is the Web Crypto API implementation Node provides since v15.
//
// This file is loaded via `setupFiles` in vitest.config.ts.

import { webcrypto } from 'node:crypto';

// Don't clobber a real global if one already exists (e.g. Node 21+
// exposes `globalThis.crypto` natively).
if (!globalThis.crypto || !globalThis.crypto.subtle) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).crypto = webcrypto;
}