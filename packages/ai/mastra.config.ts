// SPDX-License-Identifier: Apache-2.0

/**
 * Mastra CLI configuration (Phase 0).
 *
 * Loaded by the `mastra` CLI (`pnpm --filter @kestrel/ai mastra:dev`) to run
 * the development server + Studio at http://localhost:4111. The same shared
 * instance is used in-process by apps/web and apps/worker via
 * `getKestrelMastra()`, so Studio inspects the exact runtime state the
 * application sees (storage, agents, workflows, traces).
 *
 * Notes:
 * - Storage is selected from the environment (see `./src/mastra-v2/storage.ts`):
 *   `MASTRA_STORAGE=libsql` (default local) or `MASTRA_STORAGE=postgres`
 *   against the direct connection string.
 * - Mastra's internal workers stay disabled here; the standalone server
 *   process enables them via `createKestrelMastra({ runWorkers: true })`.
 */

import { createKestrelMastra } from './src/mastra-v2/instance.js';

export const mastra = createKestrelMastra();

export default mastra;
