// SPDX-License-Identifier: Apache-2.0

/**
 * Mode runner (Phase 2) — delegates Quick/Standard/Full committee analysis
 * to the `symbol-research` Mastra workflow (see
 * `../mastra-v2/workflows/symbol-research.ts`). This module owns the pieces
 * Kestrel must keep: BYOK model resolution, telemetry, per-call memory, the
 * result contract (opinions + packet + stats), and the strict Full-mode
 * failure mapping. The committee itself (specialist steps, per-step retries,
 * verify, fusion) lives in the workflow so repair/verification behavior is
 * observable as workflow run snapshots.
 */

import type { UserSettingsRow } from '@kestrel/db/schema';
import { RequestContext } from '@mastra/core/request-context';
import type { AgentMemoryOption } from '@mastra/core/agent';

import { estimateCostUsd } from '../cost';
import { resolveChatModel, type ChatModelResolution } from '../model';
import type { ResolveModelEnv } from '../vertex-factory';
import { prepareKestrelMemory } from '../mastra-v2/context';
import { getKestrelMastra } from '../mastra-v2/instance';
import { createKestrelMemory, type CreateKestrelMemoryArgs } from '../mastra-v2/memory';
import {
  createSymbolResearchWorkflow,
  MastraModeStrictFailureError,
  REQUEST_CONTEXT_SCHEMA,
  SPECIALISTS_BY_MODE,
  type MastraAnalysisMode,
  type MastraModeOpinion,
  type MastraSpecialistName,
} from '../mastra-v2/workflows/symbol-research';
import type { SymbolResearchPacket } from './symbol-research';
import {
  beginMastraRun,
  finishMastraRun,
  mastraOutcomeForError,
  type MastraGenerationStats,
} from './telemetry';

export type {
  MastraAnalysisMode,
  MastraModeOpinion,
  MastraSpecialistName,
} from '../mastra-v2/workflows/symbol-research';
export {
  MastraModeStrictFailureError,
  SPECIALISTS_BY_MODE,
  REQUEST_CONTEXT_SCHEMA,
} from '../mastra-v2/workflows/symbol-research';

export interface MastraModeSettings extends Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'> {
  embeddingModel?: UserSettingsRow['embeddingModel'];
}

export interface RunMastraModeArgs {
  prompt: string;
  symbol: string;
  userId: string;
  threadId: string;
  runId: string;
  mode: MastraAnalysisMode;
  modelOverride?: string | null;
  settings: MastraModeSettings;
  env: ResolveModelEnv;
  signal?: AbortSignal;
  telemetryKind?: 'mastra_mode' | 'mastra_full_job';
  /**
   * Storage key for the run record. Defaults to the workflow's own id
   * (`symbol-research`); the durable Full-mode queue passes `full-analysis`
   * so the worker's run continues the record the web enqueued (Phase 3).
   */
  workflowId?: string;
}

export interface MastraModeResult {
  finalText: string;
  agentOpinions: MastraModeOpinion[];
  mode: MastraAnalysisMode;
  symbol: string;
  packet: SymbolResearchPacket;
  modelId: string;
  providerId: string;
  stats: MastraGenerationStats;
  totalCostUsd: number;
  totalLatencyMs: number;
  messageId?: string;
}

export function resolveMastraModeModel(
  settings: MastraModeSettings,
  env: ResolveModelEnv,
  modelOverride?: string | null,
): ChatModelResolution {
  const pinned = process.env.MASTRA_MODE_MODEL ?? process.env.MASTRA_XAUUSD_MODEL;
  return resolveChatModel(
    {
      aiApiKeys: settings.aiApiKeys,
      chatModel: modelOverride ?? (pinned && pinned.length > 0 ? pinned : settings.chatModel),
    },
    env,
    'technical',
  );
}

/** Base run context (no packet — the workflow collects it inside its first step). */
function contextForRun(args: RunMastraModeArgs): RequestContext {
  REQUEST_CONTEXT_SCHEMA.parse({
    userId: args.userId,
    runId: args.runId,
    threadId: args.threadId,
    symbol: args.symbol,
  });
  return new RequestContext([
    ['userId', args.userId],
    ['runId', args.runId],
    ['threadId', args.threadId],
    ['symbol', args.symbol],
  ]);
}

function failedAgentsFromRun(
  result: { steps?: Record<string, { status?: string; output?: { ok?: boolean } }> },
  mode: MastraAnalysisMode,
): MastraSpecialistName[] {
  const failed: MastraSpecialistName[] = [];
  for (const name of SPECIALISTS_BY_MODE[mode]) {
    const step = result.steps?.[name];
    if (step?.status === 'failed' || step?.output?.ok === false) failed.push(name);
  }
  return failed;
}

export async function runMastraMode(args: RunMastraModeArgs): Promise<MastraModeResult> {
  const startedAt = Date.now();
  const resolution = resolveMastraModeModel(args.settings, args.env, args.modelOverride);
  beginMastraRun({
    runId: args.runId,
    threadId: args.threadId,
    model: resolution.modelId,
    providerId: resolution.providerId,
  });

  try {
    const memory = createKestrelMemory({
      settings: {
        aiApiKeys: args.settings.aiApiKeys,
        embeddingModel: args.settings.embeddingModel ?? null,
      },
      env: args.env,
    } satisfies CreateKestrelMemoryArgs);
    const prepared = await prepareKestrelMemory({
      memory,
      userId: args.userId,
      threadId: args.threadId,
      settings: {
        chatModel: args.settings.chatModel ?? null,
        embeddingModel: args.settings.embeddingModel ?? null,
      },
      backfill: true,
    });
    const requestContext = contextForRun(args);
    // Specialists read thread context but must not write their internal
    // opinions into the conversation thread. readOnly keeps the memory view
    // without persisting specialist messages; the fusion agent owns writes.
    const readOnlyCallOptions: AgentMemoryOption = {
      ...prepared.callOptions,
      options: { readOnly: true },
    };

    const workflow = createSymbolResearchWorkflow(
      {
        model: resolution.model,
        modelId: resolution.modelId,
        providerId: resolution.providerId,
        memory,
        specialistCallOptions: readOnlyCallOptions,
        fusionCallOptions: prepared.callOptions,
        ...(args.signal ? { signal: args.signal } : {}),
        mastra: getKestrelMastra().instance,
      },
      args.mode,
      args.workflowId ?? 'symbol-research',
    );
    const run = await workflow.createRun({ runId: args.runId, resourceId: args.userId });
    const result = await run.start({
      inputData: { prompt: args.prompt, symbol: args.symbol, mode: args.mode },
      requestContext,
    });

    if (result.status !== 'success') {
      // Aborts must propagate as-is so the caller records 'cancelled'.
      if (args.signal?.aborted) {
        throw (args.signal.reason ?? new DOMException('Aborted', 'AbortError'));
      }
      const error =
        result.status === 'failed' && result.error
          ? result.error
          : new Error('Mastra symbol-research workflow failed');
      if (args.mode === 'full') {
        // Strict contract: any specialist failure in Full mode is terminal.
        throw new MastraModeStrictFailureError(
          failedAgentsFromRun(result as never, args.mode),
          error,
        );
      }
      throw error;
    }

    const output = result.result as {
      status: 'ready' | 'blocked';
      blockedText?: string;
      finalText?: string;
      opinions: MastraModeOpinion[];
      packet: SymbolResearchPacket;
      stats: MastraGenerationStats;
    };

    if (output.status === 'blocked' || !output.finalText) {
      const stats = output.stats ?? { inputTokens: 0, outputTokens: 0, toolCalls: 0, steps: 0 };
      const text = output.blockedText ?? `I could not complete ${args.symbol} ${args.mode} analysis because required market data is unavailable.`;
      await finishMastraRun({
        userId: args.userId,
        threadId: args.threadId,
        runId: args.runId,
        model: resolution.modelId,
        providerId: resolution.providerId,
        startedAt,
        ...stats,
        outcome: 'success',
        ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}),
      });
      return {
        finalText: text,
        agentOpinions: [],
        mode: args.mode,
        symbol: output.packet.symbol,
        packet: output.packet,
        modelId: resolution.modelId,
        providerId: resolution.providerId,
        stats,
        totalCostUsd: 0,
        totalLatencyMs: Date.now() - startedAt,
      };
    }

    const totalCostUsd = estimateCostUsd(
      resolution.modelId,
      output.stats.inputTokens,
      output.stats.outputTokens,
    );
    await finishMastraRun({
      userId: args.userId,
      threadId: args.threadId,
      runId: args.runId,
      model: resolution.modelId,
      providerId: resolution.providerId,
      startedAt,
      ...output.stats,
      outcome: 'success',
      ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}),
    });

    return {
      finalText: output.finalText,
      agentOpinions: output.opinions,
      mode: args.mode,
      symbol: output.packet.symbol,
      packet: output.packet,
      modelId: resolution.modelId,
      providerId: resolution.providerId,
      stats: output.stats,
      totalCostUsd,
      totalLatencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    await finishMastraRun({
      userId: args.userId,
      threadId: args.threadId,
      runId: args.runId,
      model: resolution.modelId,
      providerId: resolution.providerId,
      startedAt,
      inputTokens: 0,
      outputTokens: 0,
      toolCalls: 0,
      steps: 0,
      outcome: mastraOutcomeForError(error, args.signal),
      ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}),
      error,
    });
    throw error;
  }
}
