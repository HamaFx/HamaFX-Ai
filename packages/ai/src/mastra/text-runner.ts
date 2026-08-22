import { Agent } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import { PromptInjectionDetector, UnicodeNormalizer, type InputProcessorOrWorkflow } from '@mastra/core/processors';
import type { LanguageModel, ModelMessage } from 'ai';
import type { z } from 'zod';

import { runTracingOptions } from '../mastra-v2/telemetry';
import { getMastraGenerationStats } from './telemetry';

/** Shared Unicode normalizer applied to every text-runner agent. */
const NORMALIZER = new UnicodeNormalizer({
  stripControlChars: true,
  preserveEmojis: true,
  collapseWhitespace: true,
  trim: true,
});

/**
 * Build input processors for the text-runner. The UnicodeNormalizer is
 * always applied. When a model is available, a PromptInjectionDetector with
 * the `block` strategy is added so injection attempts in extraction/routing
 * prompts are rejected before reaching the model — defense-in-depth on top
 * of the route-level regex gate.
 */
function buildInputProcessors(model?: LanguageModel): InputProcessorOrWorkflow[] {
  if (!model) return [NORMALIZER];
  try {
    const detector = new PromptInjectionDetector({
      model: model as never,
      threshold: 0.7,
      strategy: 'block',
      detectionTypes: ['injection', 'jailbreak', 'system-override'],
      lastMessageOnly: true,
      includeScores: false,
    });
    return [NORMALIZER, detector];
  } catch {
    // Detector construction can fail on edge-case model shapes; degrade
    // to normalizer-only rather than blocking the extraction call.
    return [NORMALIZER];
  }
}

export interface MastraTextRunArgs {
  task: string;
  model: LanguageModel;
  system: string;
  prompt?: string;
  messages?: ModelMessage[];
  userId?: string;
  threadId?: string;
  runId?: string;
  signal?: AbortSignal;
  maxOutputTokens?: number;
  /** Genuine Mastra tools; legacy AI SDK tools must be adapted first. */
  tools?: Record<string, unknown>;
}

export interface MastraTextRunResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  response?: { messages?: readonly unknown[] };
}

export interface MastraStructuredRunArgs<TOutput> extends Omit<
  MastraTextRunArgs,
  'prompt' | 'messages'
> {
  prompt: string;
  schema: z.ZodType<TOutput>;
}

/**
 * Execute a bounded no-tool or explicitly tool-scoped generation through
 * Mastra. The caller remains responsible for budget admission and persistence;
 * this module owns only model execution and request context.
 */
export async function runMastraText(args: MastraTextRunArgs): Promise<MastraTextRunResult> {
  const contextEntries: Array<[string, {} | undefined]> = [['task', args.task]];
  if (args.userId) contextEntries.push(['userId', args.userId]);
  if (args.threadId) contextEntries.push(['threadId', args.threadId]);
  if (args.runId) contextEntries.push(['runId', args.runId]);
  const requestContext = new RequestContext(contextEntries);
  const agentOptions = {
    id: `kestrel-mastra-${args.task.replace(/[^a-z0-9-]/gi, '-')}`,
    name: `Kestrel Mastra ${args.task}`,
    description: 'Bounded Kestrel generation executed through Mastra.',
    model: args.model,
    instructions: args.system,
    inputProcessors: buildInputProcessors(args.model),
    ...(args.tools ? { tools: args.tools } : {}),
  } as never;
  const agent = new Agent(agentOptions);
  const input = args.messages ?? args.prompt ?? '';
  const result = await agent.generate(input, {
    requestContext,
    toolChoice: args.tools ? 'auto' : 'none',
    maxSteps: args.tools ? 4 : 1,
    ...(args.maxOutputTokens ? { maxOutputTokens: args.maxOutputTokens } : {}),
    ...(args.signal ? { abortSignal: args.signal } : {}),
    ...(args.runId && args.userId && args.threadId
      ? {
          tracingOptions: runTracingOptions({
            runId: args.runId,
            userId: args.userId,
            threadId: args.threadId,
            kind: args.task,
            tags: ['text-runner'],
          }),
        }
      : {}),
  });
  const stats = getMastraGenerationStats(result);
  return {
    text: result.text,
    inputTokens: stats.inputTokens,
    outputTokens: stats.outputTokens,
    response: result.response,
  };
}

export async function runMastraStructured<TOutput>(
  args: MastraStructuredRunArgs<TOutput>,
): Promise<MastraTextRunResult & { object: TOutput }> {
  const contextEntries: Array<[string, {} | undefined]> = [['task', args.task]];
  if (args.userId) contextEntries.push(['userId', args.userId]);
  if (args.threadId) contextEntries.push(['threadId', args.threadId]);
  if (args.runId) contextEntries.push(['runId', args.runId]);
  const requestContext = new RequestContext(contextEntries);
  const agent = new Agent({
    id: `kestrel-mastra-${args.task.replace(/[^a-z0-9-]/gi, '-')}`,
    name: `Kestrel Mastra ${args.task}`,
    description: 'Bounded structured Kestrel generation executed through Mastra.',
    model: args.model,
    instructions: args.system,
    inputProcessors: buildInputProcessors(args.model),
  });
  const result = await agent.generate(args.prompt, {
    requestContext,
    toolChoice: 'none',
    maxSteps: 1,
    structuredOutput: {
      schema: args.schema,
      jsonPromptInjection: 'auto',
    },
    ...(args.maxOutputTokens ? { maxOutputTokens: args.maxOutputTokens } : {}),
    ...(args.signal ? { abortSignal: args.signal } : {}),
    ...(args.runId && args.userId && args.threadId
      ? {
          tracingOptions: runTracingOptions({
            runId: args.runId,
            userId: args.userId,
            threadId: args.threadId,
            kind: args.task,
            tags: ['text-runner'],
          }),
        }
      : {}),
  });
  const stats = getMastraGenerationStats(result);
  return {
    text: result.text,
    object: result.object as TOutput,
    inputTokens: stats.inputTokens,
    outputTokens: stats.outputTokens,
    response: result.response,
  };
}
