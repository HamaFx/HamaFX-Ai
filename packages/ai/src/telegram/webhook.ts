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

// Telegram webhook handler — upgraded for security, reliability, and UX.
//
// Key improvements over the original:
//   - Idempotency: duplicate update_ids from Telegram retries are skipped.
//   - Security: free-form messages now resolve the linked user (no more __system__).
//   - Reliability: all Telegram API calls go through the resilient client.
//   - UX: "typing" indicator, inline keyboards, message chunking.
//   - Timeouts: AI agent calls have a 30s timeout to prevent webhook hangs.
//   - Error safety: user-facing errors are sanitized (no internal details leaked).

import { type ServerEnv } from '@hamafx/shared';
import type { UIMessage } from 'ai';
import { runChat } from '../agent';
import * as crypto from 'crypto';
import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';
import { getBotDispatcher, resolveBotUser, type BotContext, type BotResponse } from '../bot';
import {
  sendTextMessage,
  sendPhoto,
  sendChatAction,
  answerCallbackQuery,
  sendInlineKeyboard,
} from './client';
import { isDuplicateUpdate, markProcessed } from './idempotency';
import { checkRateLimit } from './rate-limiter';

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    text?: string;
    from?: {
      id: number;
      first_name?: string;
      username?: string;
      is_bot: boolean;
    };
  };
  callback_query?: {
    id: string;
    data: string;
    from?: {
      id: number;
      is_bot: boolean;
    };
    message?: {
      message_id: number;
      chat: {
        id: number;
      };
    };
  };
  edited_message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
  };
}

function stringToUUID(str: string): string {
  const hash = crypto.createHash('sha256').update(str).digest('hex');
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '4' + hash.substring(13, 16),
    '8' + hash.substring(17, 20),
    hash.substring(20, 32),
  ].join('-');
}

/** Sanitize error messages for user-facing display — no internal details. */
function sanitizeError(err: unknown): string {
  if (err instanceof Error) {
    // Only show safe, generic messages
    if (err.message.includes('rate limit')) return 'Rate limit exceeded. Please try again in a minute.';
    if (err.message.includes('budget') || err.message.includes('spend')) return 'Daily AI budget limit reached. Please try again tomorrow.';
    if (err.message.includes('timeout') || err.message.includes('Timeout')) return 'The request timed out. Please try again.';
  }
  return 'An unexpected error occurred. Please try again or use the web UI at hamafx.ai.';
}

/** Send a BotResponse back to Telegram using the resilient client. */
async function sendBotResponse(
  chatId: number,
  response: BotResponse,
  botToken: string,
): Promise<void> {
  if (response.image) {
    await sendPhoto(botToken, chatId, response.image, {
      caption: response.imageCaption,
      parseMode: response.parseMode,
    }).catch((err: unknown) => {
      console.error('[telegram] sendPhoto failed:', err instanceof Error ? err.message : err);
    });
    return;
  }

  if (response.text) {
    await sendTextMessage(botToken, chatId, response.text, {
      parseMode: response.parseMode,
    }).catch((err: unknown) => {
      console.error('[telegram] sendMessage failed:', err instanceof Error ? err.message : err);
    });
  }
}

/** Send a "link your account" prompt with an inline button. */
async function sendLinkPrompt(chatId: number, botToken: string): Promise<void> {
  await sendInlineKeyboard(
    botToken,
    chatId,
    [
      '👋 Welcome to HamaFX Bot!',
      '',
      'To use this bot, you need to link your HamaFX account:',
      '',
      '1. Go to hamafx.ai/settings',
      '2. Click "Link Telegram"',
      '3. Copy the 6-character code',
      '4. Send: /link <your-code>',
      '',
      'Link codes expire after 10 minutes.',
    ].join('\n'),
    [[{ text: '🔗 Open Settings', callback_data: 'open_settings' }]],
  ).catch((err: unknown) => {
    console.error('[telegram] sendLinkPrompt failed:', err instanceof Error ? err.message : err);
  });
}

/**
 * Main webhook handler. Called by the Next.js API route.
 * All Telegram API interactions use the resilient client (retry + chunking).
 */
export async function handleTelegramWebhook(update: TelegramUpdate, env: ServerEnv) {
  const updateId = update.update_id;

  // ── Idempotency: skip duplicate updates from Telegram retries ──
  if (isDuplicateUpdate(updateId)) {
    console.log(`[telegram] Skipping duplicate update_id=${updateId}`);
    return;
  }

  const chatId = update.message?.chat.id || update.callback_query?.message?.chat.id;
  const text = update.message?.text || update.callback_query?.data;

  if (!chatId || !text) {
    markProcessed(updateId);
    return;
  }

  // Reject messages from bots (anti-spam)
  if (update.message?.from?.is_bot || update.callback_query?.from?.is_bot) {
    console.warn(`[telegram] Rejecting bot message from chat_id=${chatId}`);
    markProcessed(updateId);
    return;
  }

  const botToken = env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error('[telegram] TELEGRAM_BOT_TOKEN not configured');
    markProcessed(updateId);
    return;
  }

  // Acknowledge callback query to remove the loading spinner
  if (update.callback_query) {
    await answerCallbackQuery(botToken, update.callback_query.id);
  }

  try {
    // ── Command dispatch (messages starting with '/') ──
    if (text.startsWith('/')) {
      await handleCommand(text, chatId, botToken, env, update);
    } else {
      // ── Free-form message: route through the AI agent ──
      await handleFreeFormMessage(text, chatId, botToken, env);
    }
  } finally {
    // Mark as processed regardless of outcome (prevents infinite retries
    // for non-transient errors like unlinked users or invalid commands)
    markProcessed(updateId);
  }
}

/** Handle slash commands via the bot dispatcher. */
async function handleCommand(
  text: string,
  chatId: number,
  botToken: string,
  env: ServerEnv,
  update: TelegramUpdate,
): Promise<void> {
  // /link works without a linked account
  if (text.toLowerCase().startsWith('/link')) {
    const linkCtx: BotContext = {
      userId: '',
      chatId: String(chatId),
      platform: 'telegram',
      botToken,
    };
    const dispatcher = getBotDispatcher();
    const response = await dispatcher.dispatch(text, linkCtx);
    await sendBotResponse(chatId, response, botToken);
    return;
  }

  // /start and /help also work without linking
  if (text.toLowerCase().startsWith('/start') || text.toLowerCase().startsWith('/help')) {
    const helpCtx: BotContext = {
      userId: '',
      chatId: String(chatId),
      platform: 'telegram',
      botToken,
    };
    const dispatcher = getBotDispatcher();
    const response = await dispatcher.dispatch(text, helpCtx);
    await sendBotResponse(chatId, response, botToken);
    return;
  }

  // Resolve the linked user for all other commands
  const userId = await resolveBotUser(chatId, 'telegram');

  if (!userId) {
    await sendLinkPrompt(chatId, botToken);
    return;
  }

  // Send "typing..." indicator
  await sendChatAction(botToken, chatId, 'typing');

  // Per-user rate limit on command execution
  const rateLimit = checkRateLimit(userId, 'bot_command', 30);
  if (!rateLimit.allowed) {
    const seconds = Math.ceil(rateLimit.resetMs / 1000);
    await sendTextMessage(botToken, chatId,
      `⏳ You're sending commands too fast. Please wait ~${seconds}s and try again.`,
    );
    return;
  }

  const ctx: BotContext = {
    userId,
    chatId: String(chatId),
    platform: 'telegram',
    botToken,
  };

  const dispatcher = getBotDispatcher();

  try {
    const response = await dispatcher.dispatch(text, ctx);
    await sendBotResponse(chatId, response, botToken);
  } catch (err) {
    console.error('[telegram] Command dispatch failed:', err);
    await sendTextMessage(botToken, chatId, sanitizeError(err));
  }
}

/** Handle free-form messages through the AI agent. */
async function handleFreeFormMessage(
  text: string,
  chatId: number,
  botToken: string,
  env: ServerEnv,
): Promise<void> {
  // SECURITY FIX: resolve the linked user instead of using __system__
  const userId = await resolveBotUser(chatId, 'telegram');

  if (!userId) {
    await sendLinkPrompt(chatId, botToken);
    return;
  }

  // Rate limit free-form AI messages (more restrictive — they cost tokens)
  const rateLimit = checkRateLimit(userId, 'bot_chat', 10);
  if (!rateLimit.allowed) {
    const seconds = Math.ceil(rateLimit.resetMs / 1000);
    await sendTextMessage(botToken, chatId,
      `⏳ You've sent too many messages. Please wait ~${seconds}s and try again.`,
    );
    return;
  }

  // Send "typing..." indicator
  await sendChatAction(botToken, chatId, 'typing');

  // Map the telegram chat ID to a deterministic thread ID (per-user now)
  const threadId = stringToUUID(`tg-${userId}-default`);

  const userMessage: UIMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    parts: [{ type: 'text', text }],
  };

  try {
    // Ensure the chat thread exists in the database
    const existingThread = await getDb()
      .select()
      .from(schema.chatThreads)
      .where(eq(schema.chatThreads.id, threadId))
      .limit(1);

    if (existingThread.length === 0) {
      await getDb()
        .insert(schema.chatThreads)
        .values({
          id: threadId,
          userId,
          title: `Telegram Chat (${chatId})`,
          titleSource: 'fallback',
          pinnedSymbol: null,
          modelOverride: null,
        });
    }

    // Timeout wrapper: 30s max for AI agent to prevent webhook hangs
    const chatResult = await Promise.race([
      runChat({
        threadId,
        userId, // SECURITY FIX: use the real user ID, not __system__
        userMessage,
        env: {
          AI_GATEWAY_API_KEY: env.AI_GATEWAY_API_KEY,
          GOOGLE_GENERATIVE_AI_API_KEY: env.GOOGLE_GENERATIVE_AI_API_KEY,
          GOOGLE_VERTEX_PROJECT: env.GOOGLE_VERTEX_PROJECT,
          GOOGLE_VERTEX_LOCATION: env.GOOGLE_VERTEX_LOCATION,
          GOOGLE_APPLICATION_CREDENTIALS_JSON: env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
          GOOGLE_APPLICATION_CREDENTIALS: env.GOOGLE_APPLICATION_CREDENTIALS,
          AI_DEFAULT_MODEL: env.AI_DEFAULT_MODEL,
          AI_EMBEDDING_MODEL: env.AI_EMBEDDING_MODEL,
          MAX_DAILY_USD: env.MAX_DAILY_USD,
          MAX_TOOL_ITERATIONS: env.MAX_TOOL_ITERATIONS,
          LOG_PROMPTS: env.LOG_PROMPTS,
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI agent timeout')), 30_000),
      ),
    ]);

    const aiResponseText = await chatResult.text;

    // Send the response back to Telegram (auto-chunked if > 4000 chars)
    await sendTextMessage(botToken, chatId,
      aiResponseText || 'I processed your request. Check the web UI for full details.',
    );
  } catch (err) {
    console.error('[telegram] AI agent failed:', err);
    await sendTextMessage(botToken, chatId, sanitizeError(err));
  }
}