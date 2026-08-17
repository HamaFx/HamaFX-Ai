import type { LanguageModel } from 'ai';

import type {
  GenerateTextOpts,
  GenerateTextResult,
  LlmClient,
  StreamTextOpts,
  StreamTextResult,
} from '../../src/llm-client';

export type ScriptedLlmScenario =
  | {
      type: 'text';
      text: string;
      inputTokens?: number;
      outputTokens?: number;
      finishReason?: string;
    }
  | {
      type: 'tool';
      toolName: string;
      input: unknown;
      text: string;
      inputTokens?: number;
      outputTokens?: number;
      finishReason?: string;
    }
  | {
      type: 'error';
      error: Error;
    };

export interface ScriptedLlmCall {
  kind: 'generateText' | 'streamText';
  options: GenerateTextOpts | StreamTextOpts;
}

const SCRIPTED_MODEL = {
  specificationVersion: 'v1',
  provider: 'scripted',
  modelId: 'scripted-model',
  defaultObjectGenerationMode: 'json',
  doGenerate: async () => ({ finishReason: 'stop', usage: { inputTokens: 0, outputTokens: 0 }, content: [] }),
  doStream: async () => ({ stream: new ReadableStream(), rawCall: { rawPrompt: null, rawSettings: {} } }),
} as unknown as LanguageModel;

export function scriptedModel(): LanguageModel {
  return SCRIPTED_MODEL;
}

export function createScriptedLlmClient(initialScenarios: ScriptedLlmScenario[]): {
  client: LlmClient;
  calls: ScriptedLlmCall[];
  remainingScenarios: () => number;
} {
  const scenarios = [...initialScenarios];
  const calls: ScriptedLlmCall[] = [];

  function nextScenario(): ScriptedLlmScenario {
    const scenario = scenarios.shift();
    if (!scenario) throw new Error('Scripted LLM ran out of scenarios');
    return scenario;
  }

  async function streamText(opts: StreamTextOpts): Promise<StreamTextResult> {
    calls.push({ kind: 'streamText', options: opts });
    const scenario = nextScenario();
    if (scenario.type === 'error') throw scenario.error;

    const responseMessages = scenario.type === 'tool'
      ? await buildToolResponse(scenario, opts)
      : [{ role: 'assistant', content: [{ type: 'text', text: scenario.text }] }];
    const usage = {
      inputTokens: scenario.inputTokens ?? 100,
      outputTokens: scenario.outputTokens ?? Math.max(1, scenario.text.length),
    };
    await opts.onFinish?.({
      usage,
      finishReason: scenario.finishReason ?? 'stop',
      response: { messages: responseMessages },
    });

    return {
      toUIMessageStreamResponse: () => new Response(''),
      text: Promise.resolve(scenario.text),
    };
  }

  async function generateText(opts: GenerateTextOpts): Promise<GenerateTextResult> {
    calls.push({ kind: 'generateText', options: opts });
    const scenario = nextScenario();
    if (scenario.type === 'error') throw scenario.error;
    return {
      text: scenario.text,
      usage: {
        inputTokens: scenario.inputTokens ?? 50,
        outputTokens: scenario.outputTokens ?? Math.max(1, scenario.text.length),
      },
    };
  }

  return {
    client: { generateText, streamText },
    calls,
    remainingScenarios: () => scenarios.length,
  };
}

async function buildToolResponse(
  scenario: Extract<ScriptedLlmScenario, { type: 'tool' }>,
  opts: StreamTextOpts,
): Promise<readonly unknown[]> {
  const tool = opts.tools?.[scenario.toolName] as {
    execute?: (input: unknown, options: { toolCallId: string; messages: readonly unknown[]; abortSignal?: AbortSignal }) => Promise<unknown>;
  } | undefined;
  if (!tool?.execute) {
    throw new Error(`Scripted LLM requested unavailable tool: ${scenario.toolName}`);
  }

  const toolCallId = `scripted-call-${scenario.toolName}`;
  const toolOutput = await tool.execute(scenario.input, {
    toolCallId,
    messages: opts.messages ?? [],
    ...(opts.abortSignal ? { abortSignal: opts.abortSignal } : {}),
  });

  return [
    {
      role: 'assistant',
      content: [{ type: 'tool-call', toolName: scenario.toolName, toolCallId, args: scenario.input }],
    },
    {
      role: 'tool',
      content: [{ type: 'tool-result', toolName: scenario.toolName, toolCallId, result: toolOutput }],
    },
    {
      role: 'assistant',
      content: [{ type: 'text', text: scenario.text }],
    },
  ];
}
