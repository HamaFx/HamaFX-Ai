import type { RequestHandler } from 'msw';

export type MockFetchHandler = (url: string, options?: RequestInit) => Promise<Response>;

export function createMockFetch(): {
  handler: MockFetchHandler;
  mockResponse: (urlMatcher: RegExp | string, response: unknown, status?: number) => void;
  mockError: (urlMatcher: RegExp | string, error: Error) => void;
  reset: () => void;
  getCallHistory: () => Array<{ url: string; method: string }>;
} {
  const routes = new Map<string, { response: unknown; status: number; isError: boolean; error?: Error }>();
  const callHistory: Array<{ url: string; method: string }> = [];

  const handler: MockFetchHandler = async (url: string, options?: RequestInit) => {
    callHistory.push({ url, method: options?.method ?? 'GET' });
    for (const [pattern, route] of routes) {
      const regex = new RegExp(pattern);
      if (regex.test(url)) {
        if (route.isError && route.error) throw route.error;
        return new Response(JSON.stringify(route.response), {
          status: route.status,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
    return new Response(JSON.stringify({ error: 'unmocked' }), { status: 404 });
  };

  return {
    handler,
    mockResponse(urlMatcher: RegExp | string, response: unknown, status = 200) {
      routes.set(urlMatcher instanceof RegExp ? urlMatcher.source : urlMatcher, {
        response,
        status,
        isError: false,
      });
    },
    mockError(urlMatcher: RegExp | string, error: Error) {
      routes.set(urlMatcher instanceof RegExp ? urlMatcher.source : urlMatcher, {
        response: null,
        status: 0,
        isError: true,
        error,
      });
    },
    reset() {
      routes.clear();
      callHistory.length = 0;
    },
    getCallHistory() {
      return [...callHistory];
    },
  };
}
