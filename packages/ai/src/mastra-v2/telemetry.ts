// SPDX-License-Identifier: Apache-2.0

/**
 * Phase 8 — Mastra observability unification.
 *
 * One run identity (`runId`) answers "which stage failed, which provider,
 * what did it cost, was it grounded" across every observability surface:
 *
 * - Mastra traces  → exported to Langfuse with `runId`/`userId`/`threadId`
 *                    attached to the trace root span metadata, plus stable
 *                    trace tags (`kestrel`, agent kind, env).
 * - pino logs      → `mastra-v2/logger.ts` binds `traceId`/`runId` from the
 *                    shared AsyncLocalStorage into every Mastra log line.
 * - metrics        → `mastra_run_*` / `mastra_tool_*` counters retained in
 *                    `mastra/run-telemetry.ts` + `mastra/tool-telemetry.ts`
 *                    (tagged with run identity).
 * - scores         → the Phase 6 `scores` storage domain is keyed by runId.
 * - run state      → workflow snapshots are keyed by runId.
 * - DB telemetry   → `chat_telemetry` rows are keyed by runId/traceId.
 *
 * Exporters are best-effort: an observability outage must never change the
 * AI result, so construction and flush failures degrade silently.
 */

import { Observability, SamplingStrategyType, type ObservabilityRegistryConfig } from '@mastra/observability';
import { LangfuseExporter } from '@mastra/langfuse';
import type { Mastra } from '@mastra/core';
import type { TracingOptions } from '@mastra/core/observability';
import { createCategorizedLogger } from '@kestrel/shared/logger';

const tlog = createCategorizedLogger('ai', { component: 'mastra-telemetry' });

/** Env keys that gate Langfuse export (same set as `instrumentation.ts`). */
export function isLangfuseConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY && env.LANGFUSE_BASE_URL);
}

/**
 * Build the Mastra `Observability` entrypoint with Langfuse export.
 *
 * Returns `undefined` when Langfuse is not configured so Mastra falls back to
 * its built-in no-op observability — Kestrel never collects traces locally.
 *
 * The exporter shares the operator's existing Langfuse settings (same keys,
 * environment/release tags) used by the AI SDK path in `instrumentation.ts`,
 * so both legacy AI SDK calls and Mastra runs land in one Langfuse project.
 */
export function createMastraObservability(
  env: NodeJS.ProcessEnv = process.env,
): Observability | undefined {
  if (!isLangfuseConfigured(env)) return undefined;

  try {
    const exporterConfig: ConstructorParameters<typeof LangfuseExporter>[0] = {
      publicKey: env.LANGFUSE_PUBLIC_KEY as string,
      secretKey: env.LANGFUSE_SECRET_KEY as string,
      baseUrl: env.LANGFUSE_BASE_URL as string,
      environment: env.LANGFUSE_TRACING_ENVIRONMENT ?? env.NODE_ENV ?? 'development',
      // Prompts, tool inputs, and outputs may carry private market or user
      // context — keep them out of Langfuse unless explicitly opted in
      // (mirrors `telemetryConfig()`).
      realtime: env.LANGFUSE_REALTIME === '1' || env.LANGFUSE_REALTIME === 'true',
    };
    const release = env.LANGFUSE_RELEASE ?? env.VERCEL_GIT_COMMIT_SHA ?? env.DEPLOYED_SHA;
    if (release !== undefined) exporterConfig['release'] = release;

    const config: ObservabilityRegistryConfig = {
      configs: {
        default: {
          serviceName: env.MASTRA_OBSERVABILITY_SERVICE ?? 'kestrel-mastra',
          sampling: { type: SamplingStrategyType.RATIO, probability: langfuseSamplingRatio(env) },
          exporters: [new LangfuseExporter(exporterConfig)],
        },
      },
    };

    return new Observability(config);
  } catch (error) {
    tlog.warn('Mastra observability construction failed (tracing disabled)', {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

/**
 * Sampling probability for Mastra → Langfuse traces. Full detail costs money
 * and volume; default to 1 (always) so dev/demo traces appear immediately,
 * and let operators throttle with `MASTRA_OBSERVABILITY_SAMPLING` (0..1).
 */
export function langfuseSamplingRatio(env: NodeJS.ProcessEnv = process.env): number {
  const configured = env.MASTRA_OBSERVABILITY_SAMPLING?.trim();
  if (configured === undefined || configured === '') return 1;
  const raw = Number(configured);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 1) return raw;
  return 1;
}

/** Stable tags applied to every Kestrel Mastra trace root span. */
export function mastraTraceTags(env: NodeJS.ProcessEnv = process.env): string[] {
  return ['kestrel', env.NODE_ENV ?? 'development'];
}

export interface MastraRunTraceIdentity {
  runId: string;
  userId: string;
  threadId: string;
  /** Agent/workflow kind label (e.g. 'mastra_canonical_chat', 'symbol-research'). */
  kind: string;
  /** Extra non-sensitive tags (e.g. ['full'], ['experiment-v2']). */
  tags?: string[];
}

/**
 * Build `TracingOptions` for a Mastra agent/workflow execution so the whole
 * trace — and every child tool/model span — is linked to the Kestrel runId.
 * Pass the result to `agent.generate(..., { tracingOptions })` and
 * `run.start/resume({ tracingOptions })`.
 *
 * Metadata is attached to the trace root span, which Mastra's Langfuse
 * exporter maps onto the Langfuse trace, making "open this run in Langfuse"
 * a one-click operation from the admin run viewer.
 */
export function runTracingOptions(identity: MastraRunTraceIdentity): TracingOptions {
  const env = process.env;
  return {
    metadata: {
      runId: identity.runId,
      userId: identity.userId,
      threadId: identity.threadId,
      kind: identity.kind,
      service: 'kestrel-ai',
    },
    tags: [...mastraTraceTags(env), identity.kind, ...(identity.tags ?? [])],
  } as TracingOptions;
}

/** Langfuse base URL without trailing slash, for deep links. */
export function langfuseBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.LANGFUSE_BASE_URL ?? 'https://cloud.langfuse.com').replace(/\/+$/, '');
}

/**
 * Deep link to a Langfuse trace by its trace id. Returns `null` when Langfuse
 * is not configured — callers hide the link instead of showing a dead one.
 */
export function langfuseTraceUrl(traceId: string, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!isLangfuseConfigured(env)) return null;
  return `${langfuseBaseUrl(env)}/trace/${encodeURIComponent(traceId)}`;
}

interface Flushable {
  flush?: () => Promise<void>;
  shutdown?: () => Promise<void>;
}

/**
 * Resolve the observability entrypoint on a Mastra instance (the `mastra.observability`
 * getter) with defensive typing, since it may be a no-op when unconfigured.
 */
function observabilityEntrypoint(mastra: Mastra): Flushable | undefined {
  try {
    return (mastra as unknown as { observability?: Flushable }).observability ?? undefined;
  } catch {
    return undefined;
  }
}

/** Flush the Mastra observability exporters (best-effort, never throws). */
export async function flushMastraObservability(mastra: Mastra): Promise<void> {
  const entrypoint = observabilityEntrypoint(mastra);
  if (!entrypoint || typeof entrypoint.flush !== 'function') return;
  try {
    await entrypoint.flush();
  } catch (error) {
    tlog.warn('Mastra observability flush failed (non-fatal)', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Graceful shutdown for the Mastra observability entrypoint (process exit
 * boundaries only). Best-effort: a failure is logged, never thrown.
 */
export async function shutdownMastraObservability(mastra: Mastra): Promise<void> {
  const entrypoint = observabilityEntrypoint(mastra);
  if (!entrypoint || typeof entrypoint.shutdown !== 'function') return;
  try {
    await entrypoint.shutdown();
  } catch (error) {
    tlog.warn('Mastra observability shutdown failed (non-fatal)', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
