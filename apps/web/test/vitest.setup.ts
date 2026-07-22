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

import '@testing-library/jest-dom/vitest';
import { webcrypto } from 'node:crypto';

// Set DB env vars for tests that import the real @hamafx/db module
// (e.g. settings-actions.test.ts uses importOriginal). Tests use mocked
// DB clients so no actual connection is needed — the env var just needs
// to exist so getDb()'s module-level guard doesn't throw.
if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
}

// Don't clobber a real global if one already exists (e.g. Node 21+
// exposes `globalThis.crypto` natively).
if (!globalThis.crypto || !globalThis.crypto.subtle) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).crypto = webcrypto;
}

// jsdom does not implement PointerEvent, but several components and hooks
// listen for pointer events. Provide a minimal polyfill for tests.
if (typeof PointerEvent === 'undefined') {
  class PointerEventPolyfill extends Event {
    constructor(type: string, options: EventInit = {}) {
      super(type, options);
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).PointerEvent = PointerEventPolyfill;
}