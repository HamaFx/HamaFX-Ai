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

// P2-3 — DI-backed getDb() wrapper.
//
// Replaces direct `import { getDb } from '@hamafx/db'` across the AI
// package. Delegates to the global container, which caches the singleton
// Drizzle client. Tests override via `container.register('db', () => mockDb)`.
//
// This module is self-bootstrapping: on first import it registers the
// real @hamafx/db getDb() as the 'db' factory. This avoids a circular
// dependency through the AI barrel (services.ts → @hamafx/ai → db.ts).
//
// This is the DIP implementation: consumers depend on the container
// abstraction, not on the @hamafx/db module-level singleton.

import { container } from '@hamafx/shared';
import { getDb as getRawDb } from '@hamafx/db';
import type { DbClient } from '@hamafx/db';
import { DB } from './tokens';

// Self-bootstrap: register the real DB factory on first import.
// Idempotent — subsequent imports won't re-register (container.register
// overwrites, and the factory is the same). Tests override by calling
// container.register(DB, () => mockDb) BEFORE importing any module
// that calls getDb().
container.register(DB, () => getRawDb());

/**
 * Returns the singleton Drizzle database client via the DI container.
 */
export function getDb(): DbClient {
  return container.resolve(DB);
}
