import { Agent } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import type { LanguageModel, ModelMessage } from 'ai';
import type { z } from 'zod';

import { getMastraGenerationStats } from './telemetry';

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
