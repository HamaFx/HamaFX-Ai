export interface MockLlmResponse {
  content: string;
  toolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
  }>;
  finishReason?: 'stop' | 'tool-calls';
}

export function createMockLlm() {
  let _responses: MockLlmResponse[] = [];
  let _callCount = 0;

  const mock = {
    addResponse(resp: MockLlmResponse): void {
      _responses.push(resp);
    },
    addResponses(resps: MockLlmResponse[]): void {
      _responses.push(...resps);
    },
    setResponses(resps: MockLlmResponse[]): void {
      _responses = resps;
    },
    clear(): void {
      _responses = [];
      _callCount = 0;
    },
    get callCount(): number {
      return _callCount;
    },

    async generateText(_params: { prompt: string; tools?: Record<string, unknown> }): Promise<{
      text: string;
      toolCalls?: Array<{ toolName: string; args: Record<string, unknown> }>;
      finishReason: string;
    }> {
      const resp = _responses[_callCount] ?? _responses[_responses.length - 1] ?? {
        content: 'Mock response',
      };
      _callCount++;
      const toolCalls = resp.toolCalls?.map((tc) => ({
        toolName: tc.name,
        args: tc.args,
      }));
      return {
        text: resp.content,
        ...(toolCalls ? { toolCalls } : {}),
        finishReason: resp.finishReason ?? 'stop',
      };
    },

    async streamText(_params: { prompt: string; tools?: Record<string, unknown> }) {
      const resp = _responses[_callCount] ?? _responses[_responses.length - 1] ?? {
        content: 'Mock response',
      };
      _callCount++;
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(resp.content));
          controller.close();
        },
      });
      return {
        textStream: stream,
        text: Promise.resolve(resp.content),
        finishReason: Promise.resolve(resp.finishReason ?? 'stop'),
      };
    },
  };

  return mock;
}

export type MockLlm = ReturnType<typeof createMockLlm>;
