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

// POST /api/admin/test-telegram
//
// Sends a one-shot Telegram message via the configured bot so the single
// user can confirm `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` are wired
// correctly end-to-end. Mirrors the existing `/api/admin/test-alert-email`
// route exactly: same auth, same status codes, same body shapes.
//
// Responses:
//   200 { id }                   on Telegram 2xx; `id` is the message_id
//   401 { error: 'unauthorized' } when the session cookie is missing/invalid
//   503 { missing: string[] }    when one or more required env vars are unset
//                                 (variable NAMES only, never values)
//   502 { error: string }        on Telegram non-2xx (response text truncated)

import { z } from 'zod';

import { withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  /** Override the chat id for this single test send. */
  chatId: z.string().min(1).optional(),
});

const TELEGRAM_API = 'https://api.telegram.org';
const TEXT_BODY =
  '*\\[HamaFX\\-Ai\\] Test Telegram message*\n\nIf you received this, the alerts pipeline is wired up correctly\\.';

interface TelegramResponse {
  ok?: boolean;
  result?: { message_id?: number };
  description?: string;
}

export const POST = withAuth<void>(async (req) => {
  // 2. Parse body — accept empty body as `{}`.
  const raw = await safeReadJson(req);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

  // 3. Env contract.
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? '';

  const missing: string[] = [];
  if (!TELEGRAM_BOT_TOKEN) missing.push('TELEGRAM_BOT_TOKEN');
  if (!TELEGRAM_CHAT_ID && !body.chatId) missing.push('TELEGRAM_CHAT_ID');
  if (missing.length > 0) {
    return Response.json({ missing }, { status: 503 });
  }

  // 4. Send.
  const chatId = body.chatId ?? TELEGRAM_CHAT_ID;
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

async function safeReadJson(req: Request): Promise<unknown> {
  try {
    const text = await req.text();
    if (!text) return {};
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}
