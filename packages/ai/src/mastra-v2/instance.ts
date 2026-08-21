// SPDX-License-Identifier: Apache-2.0

/**
 * The shared Kestrel Mastra instance (Phase 0).
 *
 * One Mastra instance is shared by apps/web, apps/worker, and the standalone
 * Mastra server/Studio process. It owns:
 * - runtime storage (threads, messages, workflow snapshots, scores, datasets)
 * - Mastra's internal logger (forwarded to the shared pino stream)
 * - the server/Studio configuration (host + port)
 *
 * Kestrel keeps ownership of authentication, tenancy, BYOK resolution,
 * budgets, Drizzle business data, market data, and the capability policy.
 *
 * Agents and workflows are registered in later phases through
 * `./registry.ts`; Phase 0 only establishes the foundation.
 */

import { Mastra } from '@mastra/core';
import type { IMastraLogger } from '@mastra/core/logger';
import type { MastraCompositeStore } from '@mastra/core/storage';
import { createCategorizedLogger } from '@kestrel/shared/logger';

import { MastraPinoLogger } from './logger';
import { createMastraStorage, initializeMastraStorage, type MastraStorageKind } from './storage';

const ilog = createCategorizedLogger('ai', { component: 'mastra-instance' });

export const MASTRA_DEFAULT_PORT = 4111;
export const MASTRA_DEFAULT_HOST = '0.0.0.0';

export interface KestrelMastraOptions {
  /** Override storage (tests inject in-memory stores). */
  storage?: MastraCompositeStore;
  /** Override logger (tests may pass a silent adapter). */
  logger?: IMastraLogger | false;
  /**
   * Run Mastra's internal workers (scheduler, event processing) inside this
   * process. The web app must keep this false so scheduled workflows never
   * double-run in Vercel; the standalone Mastra server / worker process owns
   * workers.
   */
  runWorkers?: boolean;
  /** Explicit storage kind for diagnostics. */
  storageKind?: MastraStorageKind;
  env?: NodeJS.ProcessEnv;
}

export interface KestrelMastra {
  instance: Mastra;
  storageKind: MastraStorageKind;
}

function serverConfig(env: NodeJS.ProcessEnv): { port: number; host: string } {
  const port = Number(env.MASTRA_SERVER_PORT ?? '');
  return {
    port: Number.isFinite(port) && port > 0 ? Math.floor(port) : MASTRA_DEFAULT_PORT,
    host: env.MASTRA_SERVER_HOST ?? MASTRA_DEFAULT_HOST,
  };
}

/**
 * Build a fresh Kestrel Mastra instance. Prefer `getKestrelMastra()` for the
 * process-wide singleton; use this directly in tests or when you need an
 * isolated instance.
 */
export function createKestrelMastra(options: KestrelMastraOptions = {}): KestrelMastra {
  const env = options.env ?? process.env;
  const storageResult = options.storage
    ? { storage: options.storage, kind: (options.storageKind ?? 'libsql') as MastraStorageKind }
    : createMastraStorage(env);

  const server = serverConfig(env);
  ilog.debug('Building Kestrel Mastra instance', {
    storageKind: storageResult.kind,
    serverPort: server.port,
    serverHost: server.host,
    runWorkers: options.runWorkers === true,
  });

  const logger = options.logger === undefined ? new MastraPinoLogger() : options.logger;
  // The web app must never run Mastra's internal workers; the standalone
  // server process enables them explicitly via `runWorkers: true`.
  const instance =
    options.runWorkers === true
      ? new Mastra({ storage: storageResult.storage, logger, server, environment: env.NODE_ENV ?? 'development' })
      : new Mastra({
          storage: storageResult.storage,
          logger,
          server,
          environment: env.NODE_ENV ?? 'development',
          workers: false,
        });

  return { instance, storageKind: storageResult.kind };
}

let cachedMastra: KestrelMastra | null = null;

/** Process-wide singleton. Constructed lazily so tests can control env first. */
export function getKestrelMastra(): KestrelMastra {
  cachedMastra ??= createKestrelMastra();
  return cachedMastra;
}

/** Test helper — resets the singleton so the next `getKestrelMastra()` rebuilds it. */
export function _resetKestrelMastra(): void {
  cachedMastra = null;
}

/**
 * Test helper — injects an instance (e.g. one backed by temp storage) into
 * the singleton so module-level consumers like the durable full-analysis
 * queue resolve the injected storage. Tests must reset afterwards.
 */
export function _setKestrelMastraForTest(mastra: KestrelMastra): void {
  cachedMastra = mastra;
}

/**
 * Boot-time initialization: ensures the Mastra storage schema exists
 * (idempotent) before the server or worker starts accepting work.
 */
export async function initializeKestrelMastra(
  mastra: KestrelMastra = getKestrelMastra(),
): Promise<KestrelMastra> {
  const storage = mastra.instance.getStorage();
  if (storage) {
    await initializeMastraStorage({ storage, kind: mastra.storageKind });
  }
  return mastra;
}
