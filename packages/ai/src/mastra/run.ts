import type { UserSettingsRow } from '@kestrel/db/schema';
import { RequestContext } from '@mastra/core/request-context';
import type { AgentMemoryOption } from '@mastra/core/agent';
import type { LanguageModel } from 'ai';

import { getDiagnosticContext, withDiagnostics } from '../diagnostics';
import { resolveChatModel, type ChatModelResolution } from '../model';
import { telemetryConfig } from '../telemetry';
import { logWorkflowEnd, logWorkflowError, logWorkflowStart } from '../mastra-v2/logger';
import { runTracingOptions } from '../mastra-v2/telemetry';
import type { ResolveModelEnv } from '../vertex-factory';
import { createXauusdMastraAgent } from './agent';
import { buildConversationGuardrails } from '../mastra-v2/guardrails';
import { buildConversationScorers } from '../mastra-v2/evals/scorers';
import {
  createKestrelMemory,
  type CreateKestrelMemoryArgs,
} from '../mastra-v2/memory';
import { prepareKestrelMemory } from '../mastra-v2/context';
import { getKestrelMastra } from '../mastra-v2/instance';
import { createXauusdReportWorkflow } from '../mastra-v2/workflows/xauusd-report';
import { generateXauusdFollowup } from './report-generation';
import { blockedXauusdResearchText } from './report-text';
import type { XauusdResearchReport } from './report-types';
import { collectXauusdResearchPacket } from './research-packet';
import type { XauusdResearchPacket } from './research-types';
import type { MastraGenerationResultLike, MastraGenerationStats } from './stats';
import {
  beginMastraRun,
  finishMastraRun,
  getMastraGenerationStats,
  mastraOutcomeForError,
} from './telemetry';
import { xauusdMastraConversationToolNames } from './tools';
import { XauusdRequestContextSchema, type XauusdRequestContext } from './types';

export interface XauusdMastraSettings extends Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'> {
  embeddingModel?: UserSettingsRow['embeddingModel'];
}

export interface RunXauusdMastraArgs {
  prompt: string;
  userId: string;
  threadId: string;
  runId: string;
  settings: XauusdMastraSettings;
  env: ResolveModelEnv;
  /** Explicit user model override; operator pin is used when absent. */
  modelOverride?: string | null;
  signal?: AbortSignal;
  /** Telemetry kind for the run. */
  telemetryKind?: 'mastra_xauusd_poc';
  /** When set, answer using the latest verified report instead of creating a new report. */
  followup?: boolean;
  priorReport?: XauusdResearchReport | null;
}

export function resolveXauusdMastraModel(
  settings: XauusdMastraSettings,
  env: ResolveModelEnv,
  modelOverride?: string | null,
): ChatModelResolution {
  // The same resolver used by production chat provides the user's encrypted
  // BYOK key, provider choice, circuit-breaker behavior, and model catalog
  // validation. Mastra receives only the resulting LanguageModel object.
  //
  // M6 fix — the verified-report pipeline is a structured, latency-sensitive
  // multi-step generation. It intentionally does NOT honor the user's
  // heavyweight chat model pick (e.g. mistral-large-latest): flagship
  // reasoning models routinely blow past the 55s route budget for this flow
  // (measured >120s locally). The provider's fast technical tier (e.g.
  // mistral-small-latest, ~20s per verified report) is used instead.
  // Operators can pin an exact model with MASTRA_XAUUSD_MODEL="provider:model".
  const pinned = process.env.MASTRA_XAUUSD_MODEL;
  const selectedModel = modelOverride ?? (pinned && pinned.length > 0 ? pinned : null);
  const mastraSettings: XauusdMastraSettings = {
    aiApiKeys: settings.aiApiKeys,
    chatModel: selectedModel,
  };
  return resolveChatModel(mastraSettings, env, 'technical');
}

function baseContextForRun(args: RunXauusdMastraArgs): RequestContext<XauusdRequestContext> {
  const values = { userId: args.userId, runId: args.runId, threadId: args.threadId };
  XauusdRequestContextSchema.parse(values);
  return new RequestContext<XauusdRequestContext>([
    ['userId', args.userId],
    ['runId', args.runId],
    ['threadId', args.threadId],
  ]);
}

function contextForRun(
  args: RunXauusdMastraArgs,
  researchPacket: XauusdResearchPacket,
): RequestContext<XauusdRequestContext> {
  const values = {
    userId: args.userId,
    runId: args.runId,
    threadId: args.threadId,
    researchPacket,
    ...(args.priorReport ? { priorReport: args.priorReport } : {}),
  };
  XauusdRequestContextSchema.parse(values);
  const entries: Array<
    | ['userId', string]
    | ['runId', string]
    | ['threadId', string]
    | ['researchPacket', XauusdResearchPacket]
    | ['priorReport', XauusdResearchReport]
  > = [
    ['userId', args.userId],
    ['runId', args.runId],
    ['threadId', args.threadId],
    ['researchPacket', researchPacket],
  ];
  if (args.priorReport) entries.push(['priorReport', args.priorReport]);
  return new RequestContext(entries);
}

function blockedStats(): MastraGenerationStats {
  return { inputTokens: 0, outputTokens: 0, toolCalls: 0, steps: 0 };
}

export interface XauusdMastraRunResult {
  result: MastraGenerationResultLike;
  report: XauusdResearchReport | null;
  packet: XauusdResearchPacket;
  modelId: string;
  providerId: string;
  stats: MastraGenerationStats;
}

async function executeXauusdMastraRun(args: RunXauusdMastraArgs): Promise<XauusdMastraRunResult> {
  const startedAt = Date.now();
  let resolution: ChatModelResolution | null = null;

  try {
    resolution = resolveXauusdMastraModel(args.settings, args.env, args.modelOverride);
    beginMastraRun({
      runId: args.runId,
      threadId: args.threadId,
      model: resolution.modelId,
      providerId: resolution.providerId,
    });

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
    const { processors: guardrails } = buildConversationGuardrails(
      { aiApiKeys: args.settings.aiApiKeys, chatModel: args.settings.chatModel },
      args.env,
    );
    const { entries: conversationScorers } = buildConversationScorers(
      { aiApiKeys: args.settings.aiApiKeys, chatModel: args.settings.chatModel },
      args.env,
    );
    const agent = createXauusdMastraAgent({
      model: resolution.model,
      memory,
      inputProcessors: guardrails,
      scorers: conversationScorers,
    });

    // Follow-up answers explain a previously verified report; they keep the
    // direct agent path (packet collected here for the follow-up context).
    if (args.followup && args.priorReport) {
      const packet = await collectXauusdResearchPacket(args.signal);
      if (packet.status === 'blocked') {
        const stats = blockedStats();
        const text = blockedXauusdResearchText(packet);
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
          result: { text },
          report: null,
          packet,
          modelId: resolution.modelId,
          providerId: resolution.providerId,
          stats,
        };
      }
      const requestContext = contextForRun(args, packet);
      const result = await generateXauusdFollowup(
        agent,
        args.prompt,
        requestContext,
        resolution.providerId,
        args.priorReport,
        packet,
        args.signal,
        prepared.callOptions,
      );
      const stats = getMastraGenerationStats(result);
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
        result,
        report: null,
        packet,
        modelId: resolution.modelId,
        providerId: resolution.providerId,
        stats,
      };
    }

    // Verified-report pipeline: the packet is collected inside the workflow
    // (`collect-packet` step), and every generation/verification/repair attempt
    // is an observable workflow step (run snapshots) instead of an opaque loop.
    const workflow = createXauusdReportWorkflow({
      agent,
      callOptions: prepared.callOptions,
      providerId: resolution.providerId,
      ...(args.signal ? { signal: args.signal } : {}),
      mastra: getKestrelMastra().instance,
    });
    const run = await workflow.createRun({ runId: args.runId, resourceId: args.userId });
    logWorkflowStart({
      runId: args.runId,
      workflowId: 'xauusd-report',
      stepId: 'report',
      message: 'XAUUSD report workflow run started',
      meta: { model: resolution.modelId },
    });
    const runResult = await run.start({
      inputData: { prompt: args.prompt },
      requestContext: baseContextForRun(args) as never,
      tracingOptions: runTracingOptions({
        runId: args.runId,
        userId: args.userId,
        threadId: args.threadId,
        kind: args.telemetryKind ?? 'mastra_xauusd_poc',
        tags: ['xauusd-report'],
      }),
    });
    if (runResult.status !== 'success') {
      logWorkflowError({
        runId: args.runId,
        workflowId: 'xauusd-report',
        stepId: 'report',
        startedAt,
        message: 'XAUUSD report workflow run failed',
        error:
          runResult.status === 'failed' && runResult.error
            ? runResult.error
            : new Error(`XAUUSD report workflow ended with ${runResult.status}`),
      });
      if (args.signal?.aborted) {
        throw args.signal.reason ?? new DOMException('Aborted', 'AbortError');
      }
      throw (runResult.status === 'failed' && runResult.error
        ? runResult.error
        : new Error('Mastra XAUUSD report workflow failed'));
    }
    logWorkflowEnd({
      runId: args.runId,
      workflowId: 'xauusd-report',
      stepId: 'report',
      startedAt,
      message: 'XAUUSD report workflow run completed',
    });
    const output = runResult.result as {
      status: 'ready' | 'blocked';
      blockedText?: string;
      report?: XauusdResearchReport | null;
      result?: MastraGenerationResultLike;
      packet: XauusdResearchPacket;
      attempts?: number;
      stats: MastraGenerationStats;
    };
    if (output.status === 'blocked' || !output.report) {
      const stats = output.stats ?? blockedStats();
      const text =
        output.blockedText ??
        blockedXauusdResearchText(output.packet);
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
        result: { text },
        report: null,
        packet: output.packet,
        modelId: resolution.modelId,
        providerId: resolution.providerId,
        stats,
      };
    }
    const { report, packet } = output;
    const result = output.result as MastraGenerationResultLike;
    const stats = output.stats;

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
      result,
      report,
      packet,
      modelId: resolution.modelId,
      providerId: resolution.providerId,
      stats,
    };
  } catch (error) {
    const outcome = mastraOutcomeForError(error, args.signal);
    await finishMastraRun({
      userId: args.userId,
      threadId: args.threadId,
      runId: args.runId,
      model: resolution?.modelId ?? 'unresolved',
      providerId: resolution?.providerId ?? 'unresolved',
      startedAt,
      inputTokens: 0,
      outputTokens: 0,
      toolCalls: 0,
      steps: 0,
      outcome,
      ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}),
      error,
    });
    throw error;
  }
}

async function executeXauusdMastraConversationRun(
  args: RunXauusdMastraArgs,
): Promise<XauusdMastraRunResult> {
  const startedAt = Date.now();
  let resolution: ChatModelResolution | null = null;

  try {
    resolution = resolveXauusdMastraModel(args.settings, args.env, args.modelOverride);
    beginMastraRun({
      runId: args.runId,
      threadId: args.threadId,
      model: resolution.modelId,
      providerId: resolution.providerId,
    });

    const packet = await collectXauusdResearchPacket(args.signal);
    if (packet.status === 'blocked') {
      const stats = blockedStats();
      const text = blockedXauusdResearchText(packet);
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
        result: { text },
        report: null,
        packet,
        modelId: resolution.modelId,
        providerId: resolution.providerId,
        stats,
      };
    }

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
    const { processors: guardrails } = buildConversationGuardrails(
      { aiApiKeys: args.settings.aiApiKeys, chatModel: args.settings.chatModel },
      args.env,
    );
    const { entries: conversationScorers } = buildConversationScorers(
      { aiApiKeys: args.settings.aiApiKeys, chatModel: args.settings.chatModel },
      args.env,
    );
    const agent = createXauusdMastraAgent({
      model: resolution.model,
      memory,
      inputProcessors: guardrails,
      scorers: conversationScorers,
    });
    const requestContext = contextForRun(args, packet);
    const result = await agent.generate(args.prompt, {
      requestContext,
      memory: prepared.callOptions,
      toolChoice: 'auto',
      activeTools: [...xauusdMastraConversationToolNames],
      maxSteps: 3,
      ...telemetryConfig({
        functionId: 'mastra.xauusd.conversation',
        metadata: { provider: resolution.providerId },
      }),
      ...(args.signal ? { abortSignal: args.signal } : {}),
      tracingOptions: runTracingOptions({
        runId: args.runId,
        userId: args.userId,
        threadId: args.threadId,
        kind: args.telemetryKind ?? 'mastra_xauusd_poc',
        tags: ['xauusd-conversation'],
      }),
    });
    const stats = getMastraGenerationStats(result);

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
      result,
      report: null,
      packet,
      modelId: resolution.modelId,
      providerId: resolution.providerId,
      stats,
    };
  } catch (error) {
    const outcome = mastraOutcomeForError(error, args.signal);
    await finishMastraRun({
      userId: args.userId,
      threadId: args.threadId,
      runId: args.runId,
      model: resolution?.modelId ?? 'unresolved',
      providerId: resolution?.providerId ?? 'unresolved',
      startedAt,
      inputTokens: 0,
      outputTokens: 0,
      toolCalls: 0,
      steps: 0,
      outcome,
      ...(args.telemetryKind ? { telemetryKind: args.telemetryKind } : {}),
      error,
    });
    throw error;
  }
}

/**
 * Run a bounded, read-only Mastra conversation using a trusted research
 * packet. This is intentionally separate from structured report generation:
 * ordinary Single-mode chat should be conversational, while deep research
 * must continue to pass the report verifier.
 */
export function runXauusdMastraConversation(
  args: RunXauusdMastraArgs,
): Promise<XauusdMastraRunResult> {
  if (getDiagnosticContext()) return executeXauusdMastraConversationRun(args);
  return withDiagnostics(
    args.userId,
    args.threadId,
    () => executeXauusdMastraConversationRun(args),
    { runId: args.runId, deferCompletion: false },
  );
}

/**
 * Token-streaming variant of the XAUUSD conversation. Yields provider
 * chunks as they arrive; resolves final text, usage, and tool names after
 * the stream is fully consumed.
 */
export interface XauusdMastraConversationStream {
  text: AsyncIterable<string>;
  completion: Promise<{
    result: MastraGenerationResultLike;
    packet: XauusdResearchPacket;
    modelId: string;
    providerId: string;
    stats: MastraGenerationStats;
  }>;
}

export async function runXauusdMastraConversationStream(
  args: RunXauusdMastraArgs,
): Promise<XauusdMastraConversationStream> {
  const startedAt = Date.now();
  let resolution: ChatModelResolution | null = null;

  const runner = async () => {
    resolution = resolveXauusdMastraModel(args.settings, args.env, args.modelOverride);
    beginMastraRun({
      runId: args.runId,
      threadId: args.threadId,
      model: resolution.modelId,
      providerId: resolution.providerId,
    });

    const packet = await collectXauusdResearchPacket(args.signal);
    if (packet.status === 'blocked') {
      const stats = blockedStats();
      const result: MastraGenerationResultLike = {
        text: blockedXauusdResearchText(packet),
      };
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
        text: (async function* () {
          yield result.text;
        })(),
        completion: Promise.resolve({
          result,
          packet,
          modelId: resolution.modelId,
          providerId: resolution.providerId,
          stats,
        }),
      };
    }

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
    const { processors: guardrails } = buildConversationGuardrails(
      { aiApiKeys: args.settings.aiApiKeys, chatModel: args.settings.chatModel },
      args.env,
    );
    const { entries: conversationScorers } = buildConversationScorers(
      { aiApiKeys: args.settings.aiApiKeys, chatModel: args.settings.chatModel },
      args.env,
    );
    const agent = createXauusdMastraAgent({
      model: resolution.model,
      memory,
      inputProcessors: guardrails,
      scorers: conversationScorers,
    });
    const requestContext = contextForRun(args, packet);
    const output = await agent.stream(args.prompt, {
      requestContext,
      memory: prepared.callOptions,
      toolChoice: 'auto',
      activeTools: [...xauusdMastraConversationToolNames],
      maxSteps: 3,
      ...telemetryConfig({
        functionId: 'mastra.xauusd.conversation',
        metadata: { provider: resolution.providerId },
      }),
      ...(args.signal ? { abortSignal: args.signal } : {}),
      tracingOptions: runTracingOptions({
        runId: args.runId,
        userId: args.userId,
        threadId: args.threadId,
        kind: args.telemetryKind ?? 'mastra_xauusd_poc',
        tags: ['xauusd-conversation'],
      }),
    });

    async function* textIter(): AsyncIterable<string> {
      try {
        for await (const chunk of output.textStream) {
          if (args.signal?.aborted) {
            throw args.signal.reason ?? new DOMException('Aborted', 'AbortError');
          }
          yield chunk;
        }
      } catch (error) {
        await finishMastraRun({
          userId: args.userId,
          threadId: args.threadId,
          runId: args.runId,
          model: resolution?.modelId ?? 'unresolved',
          providerId: resolution?.providerId ?? 'unresolved',
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

    const completion = (async () => {
      const full = await output.getFullOutput();
      const stats = getMastraGenerationStats(full);
      const result: MastraGenerationResultLike = { text: full.text, totalUsage: full.totalUsage };
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
        result,
        packet,
        modelId: resolution.modelId,
        providerId: resolution.providerId,
        stats,
      };
    })();

    return { text: textIter(), completion };
  };

  if (getDiagnosticContext()) return runner();
  return withDiagnostics(args.userId, args.threadId, runner, {
    runId: args.runId,
    deferCompletion: false,
  });
}

/**
 * Run the isolated Mastra agent with the existing Kestrel BYOK resolver.
 *
 * The deterministic packet is collected before synthesis. Direct callers get
 * their own persisted diagnostic trace, which keeps the POC independently
 * testable and observable.
 */
export function runXauusdMastra(args: RunXauusdMastraArgs): Promise<XauusdMastraRunResult> {
  if (getDiagnosticContext()) return executeXauusdMastraRun(args);
  return withDiagnostics(args.userId, args.threadId, () => executeXauusdMastraRun(args), {
    runId: args.runId,
    deferCompletion: false,
  });
}

/** Explicit alias for callers that want to emphasize this is still a POC. */
export const runXauusdMastraProofWithByok = runXauusdMastra;

/** Keeps the model type visible to consumers writing test doubles. */
export type XauusdMastraModel = LanguageModel;
