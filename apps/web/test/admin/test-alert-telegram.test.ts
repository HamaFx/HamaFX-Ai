// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { resetAdminRateLimit } from '@/lib/admin-rate-limit';
import { POST as emailPost } from '@/app/api/admin/test-alert-email/route';
import { POST as telegramPost } from '@/app/api/admin/test-telegram/route';

vi.mock('@/lib/admin-auth', () => ({
  withAdminAuth: (handler: (req: Request, ctx: { user: { userId: string } }) => Promise<Response>) =>
    async (req: Request) => handler(req, { user: { userId: 'admin-123' } }),
}));

const originalFetch = globalThis.fetch;

function createJsonRequest(method: string, body?: unknown) {
  return new Request('http://localhost/api/admin/test', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('POST /api/admin/test-alert-email', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetAdminRateLimit();
    vi.stubEnv('RESEND_API_KEY', 'resend-key');
    vi.stubEnv('ALERT_FROM_EMAIL', 'alerts@example.com');
    vi.stubEnv('ALERT_TO_EMAIL', 'ops@example.com');
    vi.stubEnv('ALERT_TEST_ALLOW_OVERRIDE', '');
    vi.stubEnv('ALERT_TEST_RECIPIENT_ALLOWLIST', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.fetch = originalFetch;
  });

  it('sends to the configured ALERT_TO_EMAIL by default', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'resend-123' }), { status: 200 }),
    );

    const res = await emailPost(createJsonRequest('POST'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe('resend-123');
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const sent = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const payload = JSON.parse(sent.body);
    expect(payload.to).toEqual(['ops@example.com']);
  });

  it('ignores a body `to` override when override mode is disabled', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'resend-123' }), { status: 200 }),
    );

    const res = await emailPost(createJsonRequest('POST', { to: 'attacker@evil.com' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe('resend-123');
    const sent = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const payload = JSON.parse(sent.body);
    expect(payload.to).toEqual(['ops@example.com']);
  });

  it('ignores a body `to` override when override mode is enabled but no allowlist is configured', async () => {
    vi.stubEnv('ALERT_TEST_ALLOW_OVERRIDE', 'true');
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'resend-789' }), { status: 200 }),
    );

    const res = await emailPost(createJsonRequest('POST', { to: 'arbitrary@example.com' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe('resend-789');
    const sent = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const payload = JSON.parse(sent.body);
    expect(payload.to).toEqual(['ops@example.com']);
  });

  it('honours a body `to` override when an allowlist is configured and the address is in it', async () => {
    vi.stubEnv('ALERT_TEST_ALLOW_OVERRIDE', 'true');
    vi.stubEnv('ALERT_TEST_RECIPIENT_ALLOWLIST', 'ops@example.com, allowed@example.com');
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'resend-456' }), { status: 200 }),
    );

    const res = await emailPost(createJsonRequest('POST', { to: 'allowed@example.com' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe('resend-456');
    const sent = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const payload = JSON.parse(sent.body);
    expect(payload.to).toEqual(['allowed@example.com']);
  });

  it('rejects a body `to` override when it is not in the allowlist', async () => {
    vi.stubEnv('ALERT_TEST_ALLOW_OVERRIDE', 'true');
    vi.stubEnv('ALERT_TEST_RECIPIENT_ALLOWLIST', 'ops@example.com');

    const res = await emailPost(createJsonRequest('POST', { to: 'attacker@evil.com' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION');
  });

  it('returns 503 with variable names only when a required env var is missing', async () => {
    vi.stubEnv('RESEND_API_KEY', '');

    const res = await emailPost(createJsonRequest('POST'));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.missing).toContain('RESEND_API_KEY');
    const values = Object.values(body);
    expect(values).not.toContain('resend-key');
  });

  it('rate-limits repeated requests from the same admin', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'resend-123' }), { status: 200 }),
    );

    resetAdminRateLimit();

    const responses: Response[] = [];
    for (let i = 0; i < 6; i++) {
      responses.push(await emailPost(createJsonRequest('POST')));
    }

    expect(responses.slice(0, 5).every((r) => r.status === 200)).toBe(true);
    expect(responses[5].status).toBe(429);
  });
});

describe('POST /api/admin/test-telegram', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetAdminRateLimit();
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'bot-token');
    vi.stubEnv('TELEGRAM_CHAT_ID', '12345');
    vi.stubEnv('TELEGRAM_TEST_ALLOW_OVERRIDE', '');
    vi.stubEnv('TELEGRAM_TEST_CHAT_ID_ALLOWLIST', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.fetch = originalFetch;
  });

  it('sends to the configured TELEGRAM_CHAT_ID by default', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 }),
    );

    const res = await telegramPost(createJsonRequest('POST'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe('42');
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('/botbot-token/sendMessage');
  });

  it('ignores a body `chatId` override when override mode is disabled', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 }),
    );

    const res = await telegramPost(createJsonRequest('POST', { chatId: '99999' }));
    expect(res.status).toBe(200);
    const sent = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const payload = JSON.parse(sent.body);
    expect(payload.chat_id).toBe('12345');
  });

  it('ignores a body `chatId` override when override mode is enabled but no allowlist is configured', async () => {
    vi.stubEnv('TELEGRAM_TEST_ALLOW_OVERRIDE', 'true');
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 }),
    );

    const res = await telegramPost(createJsonRequest('POST', { chatId: '99999' }));
    expect(res.status).toBe(200);
    const sent = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const payload = JSON.parse(sent.body);
    expect(payload.chat_id).toBe('12345');
  });

  it('honours a body `chatId` override when an allowlist is configured and the chat ID is in it', async () => {
    vi.stubEnv('TELEGRAM_TEST_ALLOW_OVERRIDE', 'true');
    vi.stubEnv('TELEGRAM_TEST_CHAT_ID_ALLOWLIST', '12345, 67890');
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 99 } }), { status: 200 }),
    );

    const res = await telegramPost(createJsonRequest('POST', { chatId: '67890' }));
    expect(res.status).toBe(200);
    const sent = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const payload = JSON.parse(sent.body);
    expect(payload.chat_id).toBe('67890');
  });

  it('rejects a body `chatId` override when it is not in the allowlist', async () => {
    vi.stubEnv('TELEGRAM_TEST_ALLOW_OVERRIDE', 'true');
    vi.stubEnv('TELEGRAM_TEST_CHAT_ID_ALLOWLIST', '12345');

    const res = await telegramPost(createJsonRequest('POST', { chatId: '99999' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION');
  });

  it('returns 503 with variable names only when a required env var is missing', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');

    const res = await telegramPost(createJsonRequest('POST'));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.missing).toContain('TELEGRAM_BOT_TOKEN');
  });
});
