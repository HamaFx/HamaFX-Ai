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

// GET /api/telegram/webhook — Returns webhook info and bot status.
// POST /api/telegram/webhook — Receives Telegram updates.

import { handleTelegramWebhook, setBotCommands, telegramApiCall } from '@hamafx/ai';
import * as Sentry from '@sentry/nextjs';
import { getServerEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET — webhook status & info (useful for debugging). */
export async function GET(): Promise<Response> {
  const env = getServerEnv();

  if (!env.TELEGRAM_BOT_TOKEN) {
    return Response.json({
      configured: false,
      message: 'TELEGRAM_BOT_TOKEN not set. Bot is disabled.',
    });
  }

  try {
    const info = await telegramApiCall(env.TELEGRAM_BOT_TOKEN, 'getWebhookInfo', {});
    return Response.json({ configured: true, webhookInfo: info });
  } catch (err) {
    return Response.json({
      configured: true,
      error: err instanceof Error ? err.message : 'Failed to fetch webhook info',
    }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  const env = getServerEnv();

  // Validate Secret Token (Telegram sends this in a header)
  const secretToken = req.headers.get('x-telegram-bot-api-secret-token');
  if (env.TELEGRAM_SECRET_TOKEN && secretToken !== env.TELEGRAM_SECRET_TOKEN) {
    console.warn('[telegram-webhook] Invalid secret token');
    return new Response('Unauthorized', { status: 401 });
  }

  let update;
  try {
    update = await req.json();
  } catch (err) {
    console.error('[telegram-webhook] Failed to parse JSON body', err);
    return new Response('Bad Request', { status: 400 });
  }

  // STAB-03: Return 500 on handler errors so Telegram retries the update.
  // Previously the handler swallowed errors and always returned 200,
  // causing updates to be silently dropped on failures.
  try {
    await handleTelegramWebhook(update, env);
    return new Response('OK', { status: 200 });
  } catch (err) {
    // OBS-01: Capture to Sentry instead of only logging to console.
    Sentry.captureException(err, {
      tags: { component: 'telegram-webhook' },
      extra: { updateId: (update as Record<string, unknown>)?.update_id },
    });
    console.error('[telegram-webhook] Handler failed:', err);
    // Return 500 so Telegram retries delivery (up to its retry limit).
    return new Response('Internal Server Error', { status: 500 });
  }
}