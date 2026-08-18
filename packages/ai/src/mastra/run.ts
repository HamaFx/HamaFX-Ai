import { RequestContext } from '@mastra/core/request-context';
import type { LanguageModel } from 'ai';
import type { UserSettingsRow } from '@kestrel/db/schema';

import { resolveChatModel, type ChatModelResolution } from '../model';
import { withDiagnostics, getDiagnosticContext } from '../diagnostics';
import type { ResolveModelEnv } from '../vertex-factory';
import {
  beginMastraRun,
  finishMastraRun,
  getMastraGenerationStats,
  mastraOutcomeForError,
} from './telemetry';
import { createXauusdMastraAgent } from './agent';
import { collectXauusdResearchPacket } from './research-packet';
import { blockedXauusdResearchText } from './report-text';
import { generateVerifiedXauusdReport, generateXauusdFollowup } from './report-generation';
import type { XauusdResearchPacket } from './research-types';
import { XauusdRequestContextSchema, type XauusdRequestContext } from './types';
import type { XauusdResearchReport } from './report-types';
import type { MastraGenerationResultLike, MastraGenerationStats } from './stats';

export type XauusdMastraSettings = Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>;

export interface RunXauusdMastraArgs {
  prompt: string;
  userId: string;
  threadId: string;
  runId: string;
  settings: XauusdMastraSettings;
  env: ResolveModelEnv;
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
  const mastraSettings: XauusdMastraSettings = {
    aiApiKeys: settings.aiApiKeys,
    chatModel: pinned && pinned.length > 0 ? pinned : null,
  };
  return resolveChatModel(mastraSettings, env, 'technical');
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
  return new RequestContext([
    ['userId', args.userId],
    ['runId', args.runId],
    ['threadId', args.threadId],
    ['researchPacket', researchPacket],
  ]);
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
    resolution = resolveXauusdMastraModel(args.settings, args.env);
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
    const requestContext = contextForRun(args, packet);
    const generated = args.followup && args.priorReport
      ? { result: await generateXauusdFollowup(agent, args.prompt, requestContext, resolution.providerId, args.priorReport, packet, args.signal), report: null }
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

/**
 * Run the isolated Mastra agent with the existing Kestrel BYOK resolver.
 *
 * The deterministic packet is collected before synthesis. Direct callers get
 * their own persisted diagnostic trace, which keeps the POC independently
 * testable and observable.
 */
export function runXauusdMastra(args: RunXauusdMastraArgs): Promise<XauusdMastraRunResult> {
  if (getDiagnosticContext()) return executeXauusdMastraRun(args);
  return withDiagnostics(
    args.userId,
    args.threadId,
    () => executeXauusdMastraRun(args),
    { runId: args.runId, deferCompletion: false },
  );
}

/** Explicit alias for callers that want to emphasize this is still a POC. */
export const runXauusdMastraProofWithByok = runXauusdMastra;

/** Keeps the model type visible to consumers writing test doubles. */
export type XauusdMastraModel = LanguageModel;
