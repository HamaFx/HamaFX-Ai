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

import { type ServerEnv } from '@hamafx/shared';
import type { UIMessage } from 'ai';
import { runChat } from '../agent';
import * as crypto from 'crypto';
import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';
import { getBotDispatcher, resolveBotUser, type BotContext, type BotResponse } from '../bot';

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: {
      id: number;
    };
    text?: string;
  };
  callback_query?: {
    id: string;
    data: string;
    message?: {
      chat: {
        id: number;
      };
    };
  };
}

function stringToUUID(str: string): string {
  const hash = crypto.createHash('sha256').update(str).digest('hex');
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '4' + hash.substring(13, 16),
    '8' + hash.substring(17, 20),
    hash.substring(20, 32)
  ].join('-');
}

/** Send a text response back to Telegram. */
async function sendTelegramResponse(
  chatId: number,
  response: BotResponse,
  botToken: string,
): Promise<void> {
  // If the response includes an image, send it as a photo
  if (response.image) {
    await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: response.image,
        caption: response.imageCaption,
        parse_mode: response.parseMode,
      }),
    }).catch(console.error);
    return;
  }

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: response.text || 'OK',
      parse_mode: response.parseMode,
    }),
  }).catch(console.error);
}

/** Send a "link your account" prompt to an unlinked user. */
async function sendLinkPrompt(chatId: number, botToken: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: [
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
    }),
  }).catch(console.error);
}

export async function handleTelegramWebhook(update: TelegramUpdate, env: ServerEnv) {
  const chatId = update.message?.chat.id || update.callback_query?.message?.chat.id;
  const text = update.message?.text || update.callback_query?.data;

  if (!chatId || !text) {
    return;
  }

  // Acknowledge callback query to stop the loading spinner on the button
  if (update.callback_query && env.TELEGRAM_BOT_TOKEN) {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ callback_query_id: update.callback_query.id }),
    }).catch(console.error);
  }

  // ── F7: Bot Command Dispatch ──────────────────────────────────
  // If the message starts with '/', route it through the bot dispatcher.
  if (text.startsWith('/')) {
    const botToken = env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error('[telegram] TELEGRAM_BOT_TOKEN not configured');
      return;
    }

    // Special case: /link works without a linked account
    if (text.toLowerCase().startsWith('/link')) {
      const linkCtx: BotContext = {
        userId: '',
        chatId: String(chatId),
        platform: 'telegram',
        botToken,
      };
      const dispatcher = getBotDispatcher();
      const response = await dispatcher.dispatch(text, linkCtx);
      await sendTelegramResponse(chatId, response, botToken);
      return;
    }

    // Resolve the linked user
    const userId = await resolveBotUser(chatId, 'telegram');

    if (!userId) {
      // User is not linked — send the link prompt
      await sendLinkPrompt(chatId, botToken);
      return;
    }

    // Send a "Typing..." action to Telegram
    await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
    }).catch(console.error);

    // Dispatch the command
    const ctx: BotContext = {
      userId,
      chatId: String(chatId),
      platform: 'telegram',
      botToken,
    };

    const dispatcher = getBotDispatcher();
    const response = await dispatcher.dispatch(text, ctx);
    await sendTelegramResponse(chatId, response, botToken);
    return;
  }

  // ── Free-form message: route through the AI agent (existing behavior) ──
  // Pre-process slash commands (legacy custom instructions)
  let customInstructions = '';
  if (text.startsWith('/status')) {
    customInstructions = 'The user wants a quick status update of their PnL, open trades, and margin.';
  } else if (text.startsWith('/committee')) {
    customInstructions = 'The user wants to run the multi-agent committee on the mentioned pair. Immediately invoke the convene_committee tool and return the verdict.';
  } else if (text.startsWith('/snapshot')) {
    customInstructions = 'The user wants a market snapshot. Run the snapshot tool or summarize the latest macro news quickly.';
  }

  // Map the telegram chat ID to a deterministic thread ID.
  const threadId = stringToUUID(`tg-${chatId}-default`);

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
          userId: '__system__',
          title: `Telegram Chat (${chatId})`,
          titleSource: 'fallback',
          pinnedSymbol: null,
          modelOverride: null,
        });
    }

    // Send a "Typing..." action to Telegram
    if (env.TELEGRAM_BOT_TOKEN) {
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
      }).catch(console.error);
    }

    const chatResult = await runChat({
      threadId,
      userId: '__system__',
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
      ...(customInstructions ? { customInstructions } : {}),
    });

    // Wait for the full response
    const aiResponseText = await chatResult.text;

    // Send the response back to Telegram
    if (env.TELEGRAM_BOT_TOKEN) {
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: aiResponseText || 'I executed a tool, check the web UI for details.',
        }),
      });
    }

  } catch (err) {
    console.error('[telegram] Failed to process webhook:', err);
    if (env.TELEGRAM_BOT_TOKEN) {
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `Error processing request: ${err instanceof Error ? err.message : String(err)}`,
        }),
      });
    }
  }
}
