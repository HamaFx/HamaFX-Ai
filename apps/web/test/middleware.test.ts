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
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mock next-auth so the middleware's auth() wrapper calls the inner handler
// with a controlled req.auth, letting us test CSRF + header injection in
// isolation from JWT validation.
const mockAuth = vi.fn();

vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    auth: mockAuth,
  })),
}));

// Import after the mock is established. Use a dynamic import factory so the
// module is re-evaluated for each test and the mock is wired correctly.
async function loadMiddleware(): Promise<MiddlewareFn> {
  const { default: mw } = await import('../src/middleware');
  return mw as MiddlewareFn;
}

type MiddlewareFn = (req: NextRequest, ctx: { params: Promise<Record<string, string | string[]>> }) => Promise<Response>;

function makeRequest(
  pathname: string,
  opts: {
    method?: string;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  } = {},
): NextRequest {
  const url = `http://localhost:3000${pathname}`;
  const headers = new Headers(opts.headers);
  // NextRequest reads cookies from the Cookie header at construction time.
  const cookies = Object.entries(opts.cookies ?? {})
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
  if (cookies) {
    headers.set('cookie', cookies);
  }
  return new NextRequest(url, {
    method: opts.method ?? 'GET',
    headers,
  });
}

const ctx = { params: Promise.resolve({}) };

describe('middleware — Phase 0.9', () => {
  beforeEach(() => {
    mockAuth.mockReset();
    delete process.env.AUTH_MODE;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
  });

  afterEach(() => {
    delete process.env.AUTH_MODE;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
  });

  it('mints a CSRF cookie when one is absent', async () => {
    mockAuth.mockImplementation((handler: MiddlewareFn) => async (req: NextRequest) => handler(req, ctx));

    const req = makeRequest('/api/chat', { method: 'GET' });
    const middleware = await loadMiddleware();
    const res = (await middleware(req, ctx)) as NextResponse;

    const cookie = res.cookies.get('hfx_csrf');
    expect(cookie).toBeDefined();
    expect(cookie?.value).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('preserves an existing CSRF cookie', async () => {
    mockAuth.mockImplementation((handler: MiddlewareFn) => async (req: NextRequest) => handler(req, ctx));

    const req = makeRequest('/api/chat', { method: 'GET', cookies: { hfx_csrf: 'existing-token' } });
    const middleware = await loadMiddleware();
    const res = (await middleware(req, ctx)) as NextResponse;

    const cookie = res.cookies.get('hfx_csrf');
    expect(cookie?.value).toBe('existing-token');
  });

  it('rejects state-changing API requests without CSRF cookie', async () => {
    mockAuth.mockImplementation((handler: MiddlewareFn) => async (req: NextRequest) => handler(req, ctx));

    const req = makeRequest('/api/chat', {
      method: 'POST',
      headers: { 'x-csrf-token': 'token' },
    });
    const middleware = await loadMiddleware();
    const res = await middleware(req, ctx);

    expect(res.status).toBe(403);
    const text = await res.text();
    expect(text).toMatch(/CSRF token missing or invalid/);
  });

  it('rejects state-changing API requests when CSRF header does not match cookie', async () => {
    mockAuth.mockImplementation((handler: MiddlewareFn) => async (req: NextRequest) => handler(req, ctx));

    const req = makeRequest('/api/chat', {
      method: 'POST',
      headers: { 'x-csrf-token': 'wrong-token' },
      cookies: { hfx_csrf: 'correct-token' },
    });
    const middleware = await loadMiddleware();
    const res = await middleware(req, ctx);

    expect(res.status).toBe(403);
  });

  it('allows state-changing API requests with matching CSRF tokens', async () => {
    mockAuth.mockImplementation((handler: MiddlewareFn) => async (req: NextRequest) => handler(req, ctx));

    const req = makeRequest('/api/chat', {
      method: 'POST',
      headers: { 'x-csrf-token': 'valid-token' },
      cookies: { hfx_csrf: 'valid-token' },
    });
    const middleware = await loadMiddleware();
    const res = await middleware(req, ctx);

    expect(res.status).toBe(200);
  });

  it('injects x-user-id from the JWT session', async () => {
    const userId = '00000000-0000-0000-0000-000000000001';
    mockAuth.mockImplementation(
      (handler: MiddlewareFn) => async (req: NextRequest) =>
        handler(Object.assign(req, { auth: { user: { id: userId, email: 'test@example.com' } } }), ctx),
    );

    const req = makeRequest('/api/chat', { method: 'GET' });
    // The auth wrapper reads req.auth before our handler runs, so we must set
    // the property on the request object that the mocked wrapper receives.
    Object.assign(req, { auth: { user: { id: userId, email: 'test@example.com' } } });
    const middleware = await loadMiddleware();
    const res = await middleware(req, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-user-id')).toBe(userId);
  });

  it('does not inject x-user-id when session is missing', async () => {
    mockAuth.mockImplementation((handler: MiddlewareFn) => async (req: NextRequest) => handler(req, ctx));

    const req = makeRequest('/api/chat', { method: 'GET' });
    const middleware = await loadMiddleware();
    const res = await middleware(req, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-user-id')).toBeNull();
  });

  it('allows legacy bypass in non-production', async () => {
    process.env.AUTH_MODE = 'legacy';
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    mockAuth.mockImplementation((handler: MiddlewareFn) => async (req: NextRequest) => handler(req, ctx));

    const req = makeRequest('/api/chat', { method: 'GET' });
    const middleware = await loadMiddleware();
    const res = await middleware(req, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-user-id')).toBe('__system__');
  });

  it('blocks legacy bypass when NODE_ENV is production', async () => {
    process.env.AUTH_MODE = 'legacy';
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    mockAuth.mockImplementation((handler: MiddlewareFn) => async (req: NextRequest) => handler(req, ctx));

    const req = makeRequest('/api/chat', { method: 'GET' });
    const middleware = await loadMiddleware();
    const res = await middleware(req, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-user-id')).toBeNull();
  });

  it('stamps every response with x-request-id', async () => {
    mockAuth.mockImplementation((handler: MiddlewareFn) => async (req: NextRequest) => handler(req, ctx));

    const req = makeRequest('/api/chat', { method: 'GET' });
    const middleware = await loadMiddleware();
    const res = await middleware(req, ctx);

    expect(res.headers.get('x-request-id')).toBeDefined();
    expect(res.headers.get('x-request-id')).toHaveLength(36);
  });

  it('skips CSRF enforcement for /api/auth routes', async () => {
    mockAuth.mockImplementation((handler: MiddlewareFn) => async (req: NextRequest) => handler(req, ctx));

    const req = makeRequest('/api/auth/signin', {
      method: 'POST',
      headers: { 'x-csrf-token': 'token' },
    });
    const middleware = await loadMiddleware();
    const res = await middleware(req, ctx);

    expect(res.status).toBe(200);
  });
});
