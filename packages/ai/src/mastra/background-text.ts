import type { UserSettingsRow } from '@kestrel/db/schema';
import { Agent } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';

import { reserveTurnBudget } from '../budget-reservation';
import { DEFAULT_MAX_DAILY_USD, DEFAULT_TURN_ESTIMATE_USD, estimateCostUsd } from '../cost';
import { resolveChatModel, type ChatModelResolution } from '../model';
import { telemetryConfig } from '../telemetry';
import type { ResolveModelEnv } from '../vertex-factory';
import {
  beginMastraRun,
  finishMastraRun,
  getMastraGenerationStats,
  mastraOutcomeForError,
} from './telemetry';

export interface RunMastraBackgroundTextArgs {
  userId: string;
  threadId: string;
  task: 'briefing' | 'weekly_review' | 'title' | 'journal_review' | 'bot';
  prompt: string;
  system: string;
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel' | 'maxDailyUsd'>;
  env: ResolveModelEnv;
  signal?: AbortSignal;
  /** Conservative reservation for this bounded background generation. */
  estimateUsd?: number;
}

export interface MastraBackgroundTextResult {
  text: string;
  runId: string;
  modelId: string;
  providerId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}

function resolveBackgroundModel(
  settings: RunMastraBackgroundTextArgs['settings'],
  env: ResolveModelEnv,
): ChatModelResolution {
  const pinned = process.env.MASTRA_WORKER_MODEL ?? process.env.MASTRA_MODE_MODEL;
  return resolveChatModel(
    {
      aiApiKeys: settings.aiApiKeys,
      chatModel: pinned && pinned.length > 0 ? pinned : settings.chatModel,
    },
    env,
    'summary',
  );
}

/**
 * Execute one bounded, read-only background generation. Persistence and
 * idempotency remain owned by the caller; this helper only owns model
 * execution, cancellation, and Mastra run telemetry.
 */
export async function runMastraBackgroundText(
  args: RunMastraBackgroundTextArgs,
): Promise<MastraBackgroundTextResult> {
  const startedAt = Date.now();
  const runId = crypto.randomUUID();
  let resolution: ChatModelResolution | null = null;
  let budget: Awaited<ReturnType<typeof reserveTurnBudget>> | null = null;

  try {
    budget = await reserveTurnBudget({
      userId: args.userId,
      estimateUsd: args.estimateUsd ?? DEFAULT_TURN_ESTIMATE_USD,
      maxDailyUsd: args.settings.maxDailyUsd ?? DEFAULT_MAX_DAILY_USD,
      correlation: { threadId: args.threadId, runId },
    });
    resolution = resolveBackgroundModel(args.settings, args.env);
    beginMastraRun({
      runId,
      threadId: args.threadId,
      model: resolution.modelId,
      providerId: resolution.providerId,
    });

    const agent = new Agent({
      id: `kestrel-mastra-worker-${args.task}`,
      name: `Kestrel Mastra ${args.task}`,
      description: 'Bounded read-only background generation for Kestrel.',
      model: resolution.model,
      instructions: args.system,
    });
    const requestContext = new RequestContext([
      ['userId', args.userId],
      ['threadId', args.threadId],
      ['runId', runId],
      ['backgroundTask', args.task],
    ]);
    const result = await agent.generate(args.prompt, {
      requestContext,
      toolChoice: 'none',
      maxSteps: 1,
      ...telemetryConfig({
        functionId: `mastra.worker.${args.task}`,
        metadata: { task: args.task, provider: resolution.providerId },
      }),
      ...(args.signal ? { abortSignal: args.signal } : {}),
    });
    const stats = getMastraGenerationStats(result);
    const costUsd = estimateCostUsd(resolution.modelId, stats.inputTokens, stats.outputTokens);
    await finishMastraRun({
      userId: args.userId,
      threadId: args.threadId,
      runId,
      model: resolution.modelId,
      providerId: resolution.providerId,
      startedAt,
      ...stats,
      outcome: 'success',
      telemetryKind: 'mastra_worker_task',
    });
    // The helper owns admission for every caller, including cron, bot, and
    // title paths. Reconcile only after the model run has a terminal result.
    await budget.reconcile(costUsd);

    return {
      text: result.text.trim(),
      runId,
      modelId: resolution.modelId,
      providerId: resolution.providerId,
      inputTokens: stats.inputTokens,
      outputTokens: stats.outputTokens,
      costUsd,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    await finishMastraRun({
      userId: args.userId,
      threadId: args.threadId,
      runId,
      model: resolution?.modelId ?? 'unresolved',
      providerId: resolution?.providerId ?? 'unresolved',
      startedAt,
      inputTokens: 0,
      outputTokens: 0,
      toolCalls: 0,
      steps: 0,
      outcome: mastraOutcomeForError(error, args.signal),
      telemetryKind: 'mastra_worker_task',
      error,
    });
    if (budget) await budget.release();
    throw error;
  }
}
