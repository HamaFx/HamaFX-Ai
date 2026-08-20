import type { CandlesResult } from '@kestrel/data';
import { createTool, type ToolObserve } from '@mastra/core/tools';
import type { Tool } from 'ai';

import { qualityFromWarnings } from './evidence';
import { MastraMutationNameSchema } from './mutation-policy';
import { executeMastraTool } from './tool-telemetry';

interface LegacyToolWithExecute {
  description?: string;
  inputSchema?: unknown;
  execute?: (
    input: unknown,
    options?: {
      toolCallId?: string;
      messages?: unknown[];
      abortSignal?: AbortSignal;
    },
  ) => Promise<unknown> | unknown;
}

export interface CandleEvidenceMetadata {
  source: string;
  fetchedAt: string;
  dataAsOf: string;
  freshness: 'fresh' | 'stale' | 'unknown';
  quality: 'complete' | 'partial' | 'degraded';
  warnings: string[];
}

/**
 * Convert the data-layer candle metadata into the evidence fields shared by
 * the migrated Mastra adapters. The adapter never infers freshness from the
 * wall clock; it trusts the cache's explicit stale flag.
 */
export function candleEvidenceMetadata(
  result: CandlesResult,
  requestedCount: number,
): CandleEvidenceMetadata {
  const latestCandle = result.candles.at(-1);
  const warnings = [
    ...(result.stale ? ['Candles were served from stale-while-error cache'] : []),
    ...(result.candles.length < requestedCount
      ? [`Only ${result.candles.length} candles were available; ${requestedCount} were requested`]
      : []),
    ...(!latestCandle ? ['No candles were returned'] : []),
  ];

  return {
    source: latestCandle?.source ?? 'unknown',
    fetchedAt: new Date(result.producedAt).toISOString(),
    dataAsOf: new Date(latestCandle?.t ?? result.producedAt).toISOString(),
    freshness: latestCandle ? (result.stale ? 'stale' : 'fresh') : 'unknown',
    quality: qualityFromWarnings(warnings),
    warnings,
  };
}

/**
 * Invoke an existing Kestrel read-only tool without duplicating its
 * deterministic implementation. This bridge remains available for the next
 * adapter migrations; the first market adapters now share pure calculations
 * directly so they can preserve candle metadata without a second fetch.
 */
export async function executeLegacyReadOnlyTool<TOutput>(
  legacyTool: Tool,
  input: unknown,
  signal?: AbortSignal,
): Promise<TOutput> {
  const executable = legacyTool as unknown as LegacyToolWithExecute;
  if (typeof executable.execute !== 'function') {
    throw new Error('Mastra adapter received a legacy tool without an execute function');
  }

  return executable.execute(input, signal ? { abortSignal: signal } : {}) as Promise<TOutput>;
}

/**
 * Adapt a legacy AI SDK read-only tool to a genuine Mastra tool. This is the
 * compatibility seam for the canonical chat runner: Kestrel keeps ownership
 * of the existing tool implementations, while Mastra owns the agent/tool
 * loop. The adapter forwards the authenticated AsyncLocalStorage context and
 * cancellation signal; it never exposes mutation tools.
 */
export function adaptLegacyReadOnlyTool(name: string, legacyTool: Tool) {
  if (MastraMutationNameSchema.safeParse(name).success) {
    throw new Error(
      `Cannot adapt ${name}: mutation tools are forbidden in Mastra read-only agents`,
    );
  }
  const source = legacyTool as unknown as LegacyToolWithExecute;
  if (typeof source.execute !== 'function') {
    throw new Error(`Cannot adapt ${name}: legacy tool has no execute function`);
  }

  return createTool({
    id: `kestrel-${name}`,
    description: source.description ?? `Read-only Kestrel tool: ${name}`,
    ...(source.inputSchema ? { inputSchema: source.inputSchema as never } : {}),
    execute: async (
      input: unknown,
      context: {
        toolCallId?: string;
        messages?: unknown[];
        abortSignal?: AbortSignal;
        requestContext?: { get: (key: string) => unknown };
        observe?: ToolObserve;
      },
    ) =>
      executeMastraTool(`kestrel-${name}`, context, async () =>
        source.execute!(input, {
          ...(context.toolCallId ? { toolCallId: context.toolCallId } : {}),
          ...(context.messages ? { messages: context.messages } : {}),
          ...(context.abortSignal ? { abortSignal: context.abortSignal } : {}),
        }),
      ),
  } as never);
}

/**
 * Adapt a complete specialist tool map while preserving the original tool
 * names used by the specialist prompts. This is intentionally a separate
 * helper from the canonical registry filter: callers must decide the allowed
 * tool set before invoking it, and a missing executor fails closed.
 */
export function adaptLegacyReadOnlyTools(tools: Record<string, Tool>) {
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [name, adaptLegacyReadOnlyTool(name, tool)]),
  );
}
