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

// P2-3 — DI container service registration bootstrap.
//
// Registers core services into the global `container` so consumers
// can `container.resolve<DbClient>('db')` instead of calling `getDb()`
// directly. This enables test-time mocking (container.register('db',
// () => mockDb)) and centralizes singleton lifecycle management.
//
// Import this module once at application startup (e.g. in the chat
// route handler or server init). It is idempotent — repeated imports
// won't duplicate registrations.

import { container } from '@hamafx/shared';
import { VercelLlmClient } from './llm-client';
import type { LlmClient } from './llm-client';

/** Token names for the DI container. */
export const TOKENS = {
  DB: 'db',
  LLM_CLIENT: 'llmClient',
} as const;

/**
 * Register the LLM client in the DI container.
 *
 * Note: The DB client is registered by `./db.ts` on first import —
 * no need to register it here. This avoids a circular dependency
 * through the AI barrel.
 */
export function bootstrapServices(): void {
  // LLM client — Vercel AI SDK wrapper. Stateless, but the container
  // caches it so every consumer gets the same instance.
  container.register(TOKENS.LLM_CLIENT, () => new VercelLlmClient());
}

// Auto-bootstrap on first import. In production (Vercel) this runs
// once per cold start.
bootstrapServices();
