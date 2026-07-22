// SPDX-License-Identifier: Apache-2.0

// GET /api/telegram/webhook — Returns webhook info and bot status.
// POST /api/telegram/webhook — Receives Telegram updates.

import { timingSafeEqual } from 'node:crypto';

import { handleTelegramWebhook, telegramApiCall, type TelegramUpdate } from '@hamafx/ai';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';

import { getServerEnv } from '@/lib/env';
import { createScopedLoggerWithContext } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TelegramUpdateSchema = z.object({
  update_id: z.number().int(),
  message: z
    .object({
      message_id: z.number().int(),
      chat: z.object({
        id: z.number(),
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        username: z.string().optional(),
      }),
      text: z.string().optional(),
      from: z
        .object({
          id: z.number(),
          first_name: z.string().optional(),
          username: z.string().optional(),
          is_bot: z.boolean(),
        })
        .optional(),
    })
    .optional(),
  callback_query: z
    .object({
      id: z.string(),
      data: z.string(),
      from: z
        .object({
          id: z.number(),
          is_bot: z.boolean(),
        })
        .optional(),
      message: z
        .object({
          message_id: z.number().int(),
          chat: z.object({ id: z.number() }),
        })
        .optional(),
    })
    .optional(),
  edited_message: z
    .object({
      message_id: z.number().int(),
      chat: z.object({ id: z.number() }),
      text: z.string().optional(),
    })
    .optional(),
});

function safeSecretEquals(actual: string | null, expected: string): boolean {
  if (actual === null) return false;
  const actualBuf = Buffer.from(actual);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(actualBuf, expectedBuf);
}

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
    return Response.json(
      {
        configured: true,
        error: err instanceof Error ? err.message : 'Failed to fetch webhook info',
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request): Promise<Response> {
  const log = createScopedLoggerWithContext({ component: 'telegram', route: '/api/telegram/webhook' });
  const env = getServerEnv();

  if (process.env.NODE_ENV === 'production' && !env.TELEGRAM_SECRET_TOKEN) {
    log.error('TELEGRAM_SECRET_TOKEN is required in production');
    return new Response('Server misconfigured', { status: 500 });
  }

  const secretToken = req.headers.get('x-telegram-bot-api-secret-token');
  if (env.TELEGRAM_SECRET_TOKEN && !safeSecretEquals(secretToken, env.TELEGRAM_SECRET_TOKEN)) {
    console.warn('[telegram-webhook] Invalid secret token');
    return new Response('Unauthorized', { status: 401 });
  }

  let update;
  try {
    update = TelegramUpdateSchema.parse(await req.json());
  } catch (err) {
    log.errorContext(err, 'parseWebhookPayload', {});
    return new Response('Bad Request', { status: 400 });
  }

  // Return 500 on handler errors so Telegram retries the update.
  try {
    await handleTelegramWebhook(update as TelegramUpdate, env);
    return new Response('OK', { status: 200 });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { component: 'telegram-webhook' },
      extra: { updateId: update.update_id },
    });
    log.errorContext(err, 'handleTelegramWebhook', { updateId: update.update_id });
    return new Response('Internal Server Error', { status: 500 });
  }
}
