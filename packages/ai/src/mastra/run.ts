import type { UserSettingsRow } from '@kestrel/db/schema';
import { RequestContext } from '@mastra/core/request-context';
import type { LanguageModel } from 'ai';

import { getDiagnosticContext, withDiagnostics } from '../diagnostics';
import { resolveChatModel, type ChatModelResolution } from '../model';
import { telemetryConfig } from '../telemetry';
import type { ResolveModelEnv } from '../vertex-factory';
import { createXauusdMastraAgent } from './agent';
import { loadMastraMemoryContext, serializeMastraMemoryContext } from './memory-context';
import { generateVerifiedXauusdReport, generateXauusdFollowup } from './report-generation';
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
  /** Marks background comparisons separately in durable telemetry. */
  telemetryKind?: 'mastra_xauusd_poc' | 'mastra_xauusd_shadow';
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

function contextForRun(
  args: RunXauusdMastraArgs,
  researchPacket: XauusdResearchPacket,
  memoryContext?: string,
): RequestContext<XauusdRequestContext> {
  const values = {
    userId: args.userId,
    runId: args.runId,
    threadId: args.threadId,
    researchPacket,
    ...(args.priorReport ? { priorReport: args.priorReport } : {}),
    ...(memoryContext ? { memoryContext } : {}),
  };
  XauusdRequestContextSchema.parse(values);
  const entries: Array<
    | ['userId', string]
    | ['runId', string]
    | ['threadId', string]
    | ['researchPacket', XauusdResearchPacket]
    | ['priorReport', XauusdResearchReport]
    | ['memoryContext', string]
  > = [
    ['userId', args.userId],
    ['runId', args.runId],
    ['threadId', args.threadId],
    ['researchPacket', researchPacket],
  ];
  if (args.priorReport) entries.push(['priorReport', args.priorReport]);
  if (memoryContext) entries.push(['memoryContext', memoryContext]);
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
        report: null as XauusdResearchReport | null,
        packet,
        modelId: resolution.modelId,
        providerId: resolution.providerId,
        stats,
      };
    }

    const agent = createXauusdMastraAgent({ model: resolution.model });
    const memoryContext = serializeMastraMemoryContext(
      await loadMastraMemoryContext({
        userId: args.userId,
        threadId: args.threadId,
        query: args.prompt,
        settings: {
          aiApiKeys: args.settings.aiApiKeys,
          embeddingModel: args.settings.embeddingModel ?? null,
        },
        env: args.env,
        ...(args.signal ? { signal: args.signal } : {}),
      }),
    );
    const requestContext = contextForRun(args, packet, memoryContext);
    const generated =
      args.followup && args.priorReport
        ? {
            result: await generateXauusdFollowup(
              agent,
              args.prompt,
              requestContext,
              resolution.providerId,
              args.priorReport,
              packet,
              args.signal,
            ),
            report: null,
          }
        : await generateVerifiedXauusdReport(
            agent,
            args.prompt,
            requestContext,
            resolution.providerId,
            packet,
            args.signal,
          );
    const { result, report } = generated;
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

    const agent = createXauusdMastraAgent({ model: resolution.model });
    const memoryContext = serializeMastraMemoryContext(
      await loadMastraMemoryContext({
        userId: args.userId,
        threadId: args.threadId,
        query: args.prompt,
        settings: {
          aiApiKeys: args.settings.aiApiKeys,
          embeddingModel: args.settings.embeddingModel ?? null,
        },
        env: args.env,
        ...(args.signal ? { signal: args.signal } : {}),
      }),
    );
    const requestContext = contextForRun(args, packet, memoryContext);
    const result = await agent.generate(args.prompt, {
      requestContext,
      toolChoice: 'auto',
      activeTools: [...xauusdMastraConversationToolNames],
      maxSteps: 3,
      ...telemetryConfig({
        functionId: 'mastra.xauusd.conversation',
        metadata: { provider: resolution.providerId },
      }),
      ...(args.signal ? { abortSignal: args.signal } : {}),
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
