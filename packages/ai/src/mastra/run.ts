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
import { generateVerifiedXauusdReport } from './report-generation';
import type { XauusdResearchPacket } from './research-types';
import { XauusdRequestContextSchema, type XauusdRequestContext } from './types';
import type { XauusdResearchReport } from './report-types';

export type XauusdMastraSettings = Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>;

export interface RunXauusdMastraArgs {
  prompt: string;
  userId: string;
  threadId: string;
  runId: string;
  settings: XauusdMastraSettings;
  env: ResolveModelEnv;
  signal?: AbortSignal;
}

export function resolveXauusdMastraModel(
  settings: XauusdMastraSettings,
  env: ResolveModelEnv,
): ChatModelResolution {
  // The same resolver used by production chat provides the user's encrypted
  // BYOK key, provider choice, circuit-breaker behavior, and model catalog
  // validation. Mastra receives only the resulting LanguageModel object.
  return resolveChatModel(settings, env, 'technical');
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
  };
  XauusdRequestContextSchema.parse(values);
  return new RequestContext([
    ['userId', args.userId],
    ['runId', args.runId],
    ['threadId', args.threadId],
    ['researchPacket', researchPacket],
  ]);
}

function blockedStats() {
  return { inputTokens: 0, outputTokens: 0, toolCalls: 0, steps: 0 };
}

async function executeXauusdMastraRun(args: RunXauusdMastraArgs) {
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
    const verified = await generateVerifiedXauusdReport(
      agent,
      args.prompt,
      contextForRun(args, packet),
      resolution.providerId,
      packet,
      args.signal,
    );
    const { result, report } = verified;
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
export function runXauusdMastra(args: RunXauusdMastraArgs) {
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
