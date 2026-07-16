/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */import { beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { AppError, validationError } from '@hamafx/shared';
import { ProviderError } from '@hamafx/data';

import { errorResponse, getUserFromRequest, parseJsonBody, parseSearchParams, withAuth } from '../src/lib/api';

vi.mock('@/auth', () => ({ auth: vi.fn() }));

const { auth: mockAuth } = await import('@/auth');

function mockRequest(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

describe('parseSearchParams', () => {
  const schema = z.object({
    symbol: z.string(),
    limit: z.coerce.number().optional(),
  });

  it('parses valid search parameters', () => {
    const req = mockRequest('http://localhost/api?symbol=XAUUSD&limit=10');
    const result = parseSearchParams(req, schema);
    expect(result).toEqual({ symbol: 'XAUUSD', limit: 10 });
  });

  it('handles missing optional fields', () => {
    const req = mockRequest('http://localhost/api?symbol=XAUUSD');
    const result = parseSearchParams(req, schema);
    expect(result).toEqual({ symbol: 'XAUUSD' });
  });

  it('throws on invalid params', () => {
    const req = mockRequest('http://localhost/api?limit=abc');
    expect(() => parseSearchParams(req, schema)).toThrow();
  });

  it('throws when required field is missing', () => {
    const req = mockRequest('http://localhost/api?limit=5');
    expect(() => parseSearchParams(req, schema)).toThrow();
  });

  it('parses multiple parameters', () => {
    const req = mockRequest('http://localhost/api?a=1&b=2&c=3');
    const multi = z.object({ a: z.string(), b: z.string(), c: z.string() });
    const result = parseSearchParams(req, multi);
    expect(result).toEqual({ a: '1', b: '2', c: '3' });
  });

  it('handles empty query string', () => {
    const req = mockRequest('http://localhost/api');
    const emptySchema = z.object({}).strict();
    const result = parseSearchParams(req, emptySchema);
    expect(result).toEqual({});
  });
});

describe('errorResponse', () => {
  it('returns 400 for validation errors', async () => {
    const err = validationError('Invalid email');
    const res = errorResponse(err);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION');
  });

  it('returns 401 for unauthorized errors', async () => {
    const err = new AppError('UNAUTHORIZED', 'Auth required', 401);
    const res = errorResponse(err);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe('Auth required');
  });

  it('returns 500 for plain Error instances', async () => {
    const res = errorResponse(new Error('Something went wrong'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL');
  });

  it('returns 500 for unknown errors', async () => {
    const res = errorResponse('string error');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).toBe('Internal error');
  });

  it('returns 503 for provider errors', async () => {
    const providerErr = new ProviderError('Provider down', 'openai');
    const res = errorResponse(providerErr);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe('PROVIDER_UNAVAILABLE');
  });

  it('includes X-Request-Id header when req is passed', () => {
    const req = mockRequest('http://localhost', {
      headers: { 'x-request-id': 'req-123' },
    });
    const err = validationError('bad');
    const res = errorResponse(err, req);
    expect(res.headers.get('x-request-id')).toBe('req-123');
  });

  it('includes requestId in the JSON body when available', async () => {
    const req = mockRequest('http://localhost', {
      headers: { 'x-request-id': 'req-456' },
    });
    const err = validationError('bad');
    const res = errorResponse(err, req);
    const body = await res.json();
    expect(body.error.requestId).toBe('req-456');
  });

  it('returns 403 for forbidden errors', async () => {
    const err = new AppError('FORBIDDEN', 'Access denied', 403);
    const res = errorResponse(err);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 404 for not-found errors', async () => {
    const err = new AppError('NOT_FOUND', 'Resource not found', 404);
    const res = errorResponse(err);
    expect(res.status).toBe(404);
  });
});

describe('parseJsonBody', () => {
  const schema = z.object({
    name: z.string(),
    age: z.number().optional(),
  });

  it('parses a valid JSON body', async () => {
    const req = mockRequest('http://localhost', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Alice', age: 30 }),
    });
    const result = await parseJsonBody(req, schema);
    expect(result).toEqual({ name: 'Alice', age: 30 });
  });

  it('throws for missing required fields', async () => {
    const req = mockRequest('http://localhost', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ age: 30 }),
    });
    await expect(parseJsonBody(req, schema)).rejects.toThrow();
  });

  it('throws for invalid JSON', async () => {
    const req = mockRequest('http://localhost', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });
    await expect(parseJsonBody(req, schema)).rejects.toThrow();
  });

  it('rejects payloads exceeding content-length limit', async () => {
    const maxBytes = 6 * 1024 * 1024;
    const req = mockRequest('http://localhost', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(maxBytes + 1),
      },
    });
    await expect(parseJsonBody(req, schema)).rejects.toThrow(/Payload too large/);
  });

  it('throws for an empty body', async () => {
    const req = mockRequest('http://localhost', { method: 'POST' });
    await expect(parseJsonBody(req, schema)).rejects.toThrow();
  });

  it('parses a body with only optional field', async () => {
    const req = mockRequest('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ name: 'Bob' }),
    });
    const result = await parseJsonBody(req, schema);
    expect(result).toEqual({ name: 'Bob' });
  });
});

describe('getUserFromRequest', () => {
  beforeAll(() => {
    vi.mocked(mockAuth).mockResolvedValue(null);
  });

  it('rejects bare x-user-id header without signature (SEC-1)', async () => {
    // SEC-1: bare x-user-id without a valid signature is rejected,
    // falling through to auth() which is mocked to return null.
    const req = mockRequest('http://localhost', {
      headers: { 'x-user-id': 'user-no-sig' },
    });
    const user = await getUserFromRequest(req);
    expect(user).toBeNull();
  });

  it('falls through to auth() when no header is present', async () => {
    vi.mocked(mockAuth).mockResolvedValueOnce({
      user: { id: 'user-slow', email: 'a@b.com', name: 'Alice' },
    } as never);
    const req = mockRequest('http://localhost');
    const user = await getUserFromRequest(req);
    expect(user).toEqual({ userId: 'user-slow', email: 'a@b.com', name: 'Alice' });
  });

  it('returns null when auth() returns no user', async () => {
    vi.mocked(mockAuth).mockResolvedValueOnce({} as never);
    const req = mockRequest('http://localhost');
    const user = await getUserFromRequest(req);
    expect(user).toBeNull();
  });

  it('returns null when auth() throws', async () => {
    vi.mocked(mockAuth).mockRejectedValueOnce(new Error('auth error'));
    const req = mockRequest('http://localhost');
    const user = await getUserFromRequest(req);
    expect(user).toBeNull();
  });
});

describe('withAuth', () => {
  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(mockAuth).mockResolvedValue(null);
    const handler = withAuth(async (_req, { user }) => {
      return new Response(JSON.stringify({ userId: user.userId }));
    });
    const req = mockRequest('http://localhost');
    const res = await handler(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('calls handler when user resolves via auth() slow path', async () => {
    // SEC-1: bare x-user-id is rejected → falls through to auth()
    vi.mocked(mockAuth).mockResolvedValueOnce({
      user: { id: 'user-1' },
    } as never);
    const req = mockRequest('http://localhost', {
      headers: { 'x-user-id': 'user-1' },
    });
    const handler = withAuth(async (_req, { user }) => {
      return Response.json({ userId: user.userId });
    });
    const res = await handler(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('user-1');
  });

  it('catches handler errors and returns error response', async () => {
    vi.mocked(mockAuth).mockResolvedValueOnce({
      user: { id: 'user-1' },
    } as never);
    const req = mockRequest('http://localhost', {
      headers: { 'x-user-id': 'user-1' },
    });
    const handler = withAuth(async () => {
      throw validationError('something went wrong');
    });
    const res = await handler(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION');
  });

  it('propagates x-request-id in 401 response', async () => {
    const req = mockRequest('http://localhost', {
      headers: { 'x-request-id': 'my-req-id' },
    });
    const handler = withAuth(async () => new Response());
    const res = await handler(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
    expect(res.headers.get('x-request-id')).toBe('my-req-id');
  });
});
