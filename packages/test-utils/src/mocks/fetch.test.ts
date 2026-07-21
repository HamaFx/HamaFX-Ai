import { describe, expect, it, beforeEach } from 'vitest';
import { createMockFetch } from './fetch';

describe('createMockFetch', () => {
  let mock: ReturnType<typeof createMockFetch>;

  beforeEach(() => {
    mock = createMockFetch();
  });

  it('returns 404 for unmocked URLs', async () => {
    const response = await mock.handler('https://example.com/api/unknown');
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({ error: 'unmocked' });
  });

  it('matches a string URL pattern', async () => {
    mock.mockResponse('https://example.com/api/test', { data: 'ok' });
    const response = await mock.handler('https://example.com/api/test');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ data: 'ok' });
  });

  it('matches a regex URL pattern', async () => {
    mock.mockResponse(/api\/users\/\d+/, { name: 'Alice' });
    const response = await mock.handler('https://example.com/api/users/42');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ name: 'Alice' });
  });

  it('allows custom status codes', async () => {
    mock.mockResponse('error-endpoint', { message: 'not found' }, 404);
    const response = await mock.handler('error-endpoint');
    expect(response.status).toBe(404);
  });

  it('throws Error for mocked error routes', async () => {
    mock.mockError('failing-endpoint', new Error('Network down'));
    await expect(mock.handler('failing-endpoint')).rejects.toThrow('Network down');
  });

  it('tracks call history with URL and method', async () => {
    await mock.handler('/api/a', { method: 'POST' });
    await mock.handler('/api/b', { method: 'GET' });

    const history = mock.getCallHistory();
    expect(history).toHaveLength(2);
    expect(history[0]!).toEqual({ url: '/api/a', method: 'POST' });
    expect(history[1]!).toEqual({ url: '/api/b', method: 'GET' });
  });

  it('defaults method to GET when not specified', async () => {
    await mock.handler('/api/test');
    expect(mock.getCallHistory()[0]!.method).toBe('GET');
  });

  it('reset() clears routes and call history', async () => {
    mock.mockResponse('/test', { ok: true });
    await mock.handler('/test');
    mock.reset();

    // Routes are cleared — a fresh call to the same URL returns 404
    const response = await mock.handler('/test');
    expect(response.status).toBe(404);
    // History was also cleared on reset, but the handler call above added one entry
    expect(mock.getCallHistory()).toHaveLength(1);
  });

  it('reset() clears history before any subsequent calls', () => {
    mock.mockResponse('/a', {});
    // No handler call yet — just reset
    mock.reset();
    expect(mock.getCallHistory()).toHaveLength(0);
  });

  it('getCallHistory returns a copy, not the internal reference', () => {
    const history1 = mock.getCallHistory();
    // Mutating the returned copy should not affect internal state
    (history1 as unknown[]).push({ url: '/injected', method: 'POST' });
    expect(mock.getCallHistory()).toHaveLength(0);
  });

  it('matches the first matching pattern when multiple are registered', async () => {
    mock.mockResponse(/api/, { first: true });
    mock.mockResponse(/api\/specific/, { second: true });

    const response = await mock.handler('/api/specific');
    const body = await response.json();
    expect(body).toEqual({ first: true }); // first match wins
  });

  it('returns JSON content-type header on matched responses', async () => {
    mock.mockResponse('/data', { key: 'value' });
    const response = await mock.handler('/data');
    expect(response.headers.get('content-type')).toBe('application/json');
  });
});
