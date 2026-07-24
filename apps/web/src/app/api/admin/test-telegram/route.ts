// SPDX-License-Identifier: Apache-2.0

// POST /api/admin/test-telegram
//
// Sends a one-shot Telegram message via the configured bot so the
// operator can confirm `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` are
// wired correctly end-to-end.
//
// Security:
//   - Requires admin authentication (withAdminAuth).
//   - The caller-controlled `chatId` override is ignored unless the
//     operator explicitly sets TELEGRAM_TEST_ALLOW_OVERRIDE=true. When
//     overrides are enabled, an optional TELEGRAM_TEST_CHAT_ID_ALLOWLIST
//     restricts the permitted chat IDs (comma-separated). This prevents
//     the route from becoming an open relay for arbitrary Telegram chats.
//   - Rate-limited to 5 requests per minute per admin.
//
// Responses:
//   200 { id }                         on Telegram 2xx; `id` is the message_id
//   400 { error: { code, message } }   on validation / allowlist failure
//   401 { error: { code, message } }   when the session cookie is missing/invalid
//   403 { error: { code, message } }   when the authenticated user is not an admin
//   429 { error: { code, message } }   when the per-admin rate limit is exceeded
//   503 { missing: string[] }          when one or more required env vars are unset
//                                      (variable NAMES only, never values)
//   502 { error: string }              on Telegram non-2xx (response text truncated)

import { AppError } from '@hamafx/shared';
import { z } from 'zod';

import { withAdminAuth } from '@/lib/admin-auth';
import { errorResponse, parseJsonBody } from '@/lib/api';
import { checkAdminRateLimit } from '@/lib/admin-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  /** Override the chat id for this single test send. */
  chatId: z.string().min(1).optional(),
}).default({});

const TELEGRAM_API = 'https://api.telegram.org';
const TEXT_BODY =
  '*\\[HamaFX\\-Ai\\] Test Telegram message*\n\nIf you received this, the alerts pipeline is wired up correctly\\.';

interface TelegramResponse {
  ok?: boolean;
  result?: { message_id?: number };
  description?: string;
}

export const POST = withAdminAuth(async (req, { user }) => {
  const body = await parseJsonBody(req, BodySchema);

  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? '';

  const override = deriveTelegramRecipient(body.chatId);
  if (!override.ok) {
    return errorResponse(new AppError('VALIDATION', override.error, 400), req);
  }

  const chatId = override.chatId ?? TELEGRAM_CHAT_ID;

  const rateLimit = checkAdminRateLimit(user.userId);
  if (!rateLimit.allowed) {
    const headers: Record<string, string> = {};
    if (rateLimit.retryAfter !== undefined) {
      headers['Retry-After'] = String(rateLimit.retryAfter);
    }
    return Response.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment.' } },
      { status: 429, headers },
    );
  }

  const missing: string[] = [];
  if (!TELEGRAM_BOT_TOKEN) missing.push('TELEGRAM_BOT_TOKEN');
  if (!chatId) missing.push('TELEGRAM_CHAT_ID');
  if (missing.length > 0) {
    return Response.json({ missing }, { status: 503 });
  }

  const tgResponse = await fetch(`${TELEGRAM_API}/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: TEXT_BODY,
      parse_mode: 'MarkdownV2',
    }),
  });

  if (!tgResponse.ok) {
    const text = await tgResponse.text().catch(() => '');
    return Response.json(
      { error: `telegram HTTP ${tgResponse.status}: ${text.slice(0, 200)}` },
      { status: 502 },
    );
  }

  const json = (await tgResponse.json().catch(() => ({}))) as TelegramResponse;
  const messageId = json.result?.message_id ?? null;
  return Response.json({ id: messageId === null ? null : String(messageId) }, { status: 200 });
});

interface RecipientResult {
  ok: true;
  chatId?: string;
}

interface RecipientError {
  ok: false;
  error: string;
}

function deriveTelegramRecipient(bodyChatId: string | undefined): RecipientResult | RecipientError {
  const allowOverride = process.env.TELEGRAM_TEST_ALLOW_OVERRIDE === 'true';
  if (!allowOverride || !bodyChatId) {
    return { ok: true };
  }

  const allowlistRaw = process.env.TELEGRAM_TEST_CHAT_ID_ALLOWLIST;
  if (!allowlistRaw) {
    // Override is enabled but no allowlist is configured; ignore the override
    // and fall back to the configured chat ID.
    return { ok: true };
  }

  const allowlist = allowlistRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allowlist.includes(bodyChatId)) {
    return {
      ok: false,
      error: 'chatId not in TELEGRAM_TEST_CHAT_ID_ALLOWLIST',
    };
  }

  return { ok: true, chatId: bodyChatId };
}
