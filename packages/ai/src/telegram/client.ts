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

// Telegram Bot API client with retry, rate-limit awareness, and message chunking.
//
// Design goals:
//   - Resilient: retries transient failures (429, 5xx, network) with backoff.
//   - Safe: chunks long messages to respect Telegram's 4096-char limit.
//   - Observable: logs all API errors with context for debugging.
//   - Lightweight: uses plain fetch, no extra dependencies.

import { withRetry } from '../retry';

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const MAX_MESSAGE_LENGTH = 4096;
const SAFE_CHUNK_LENGTH = 4000; // Leave headroom for formatting

interface TelegramApiResponse {
  ok: boolean;
  description?: string;
  error_code?: number;
  result?: unknown;
}

/** Error thrown when a Telegram API call fails. */
export class TelegramApiError extends Error {
  constructor(
    message: string,
    public readonly errorCode?: number,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'TelegramApiError';
  }
}

/** Classify a Telegram API error as retryable or not. */
function classifyTelegramError(status: number): { retryable: boolean; description: string } {
  if (status === 429) return { retryable: true, description: 'Rate limited by Telegram' };
  if (status >= 500) return { retryable: true, description: 'Telegram server error' };
  if (status === 409) return { retryable: false, description: 'Conflict — duplicate webhook or terminated' };
  if (status === 401) return { retryable: false, description: 'Invalid bot token' };
  return { retryable: false, description: `Telegram API error (${status})` };
}

/**
 * Low-level Telegram API call with retry logic.
 * Retries on 429 and 5xx responses, fails fast on 4xx.
 */
export async function telegramApiCall<T = TelegramApiResponse>(
  botToken: string,
  method: string,
  body: Record<string, unknown>,
  options?: { signal?: AbortSignal },
): Promise<T> {
  const url = `${TELEGRAM_API_BASE}/bot${botToken}/${method}`;

  return withRetry(
    async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: options?.signal,
      });

      const data: TelegramApiResponse = await res.json();

      if (!data.ok) {
        const classification = classifyTelegramError(data.error_code ?? res.status);
        throw new TelegramApiError(
          data.description ?? classification.description,
          data.error_code ?? res.status,
          classification.retryable,
        );
      }

      return data.result as T;
    },
    {
      maxAttempts: 4,
      baseDelayMs: 300,
      maxDelayMs: 5_000,
      signal: options?.signal ?? null,
      isRetryable: (err) => {
        if (err instanceof TelegramApiError) return err.retryable;
        // Network errors are retryable
        if (err instanceof TypeError) return true; // fetch network failure
        return false;
      },
      onRetry: (err, attempt, delayMs) => {
        console.warn(
          `[telegram-api] Retrying ${method} (attempt ${attempt + 1}) after ${Math.round(delayMs)}ms:`,
          err instanceof Error ? err.message : String(err),
        );
      },
    },
  );
}

/**
 * Send a text message, automatically chunking if it exceeds Telegram's limit.
 * Returns the number of messages sent.
 */
export async function sendTextMessage(
  botToken: string,
  chatId: number | string,
  text: string,
  options?: {
    parseMode?: 'HTML' | 'MarkdownV2';
    replyToMessageId?: number;
    disableWebPagePreview?: boolean;
    signal?: AbortSignal;
  },
): Promise<number> {
  if (!text || text.trim().length === 0) return 0;

  const chunks = chunkText(text, SAFE_CHUNK_LENGTH);
  let sent = 0;

  for (let i = 0; i < chunks.length; i++) {
    await telegramApiCall(botToken, 'sendMessage', {
      chat_id: chatId,
      text: chunks[i],
      parse_mode: options?.parseMode,
      reply_to_message_id: i === 0 ? options?.replyToMessageId : undefined,
      disable_web_page_preview: options?.disableWebPagePreview ?? true,
    }, { signal: options?.signal });
    sent++;
  }

  return sent;
}

/**
 * Send a photo (base64-encoded or URL).
 */
export async function sendPhoto(
  botToken: string,
  chatId: number | string,
  photo: string,
  options?: {
    caption?: string;
    parseMode?: 'HTML' | 'MarkdownV2';
    signal?: AbortSignal;
  },
): Promise<void> {
  await telegramApiCall(botToken, 'sendPhoto', {
    chat_id: chatId,
    photo,
    caption: options?.caption?.slice(0, 1024), // Telegram caption limit
    parse_mode: options?.parseMode,
  }, { signal: options?.signal });
}

/**
 * Send a "chat action" indicator (e.g. "typing...").
 */
export async function sendChatAction(
  botToken: string,
  chatId: number | string,
  action: 'typing' | 'upload_photo' | 'upload_document' | 'find_location' = 'typing',
): Promise<void> {
  try {
    await telegramApiCall(botToken, 'sendChatAction', {
      chat_id: chatId,
      action,
    });
  } catch {
    // Chat action failures are non-critical — swallow silently
  }
}

/**
 * Answer a callback query (removes the loading spinner on inline buttons).
 */
export async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  try {
    await telegramApiCall(botToken, 'answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: text?.slice(0, 200), // Telegram answer callback text limit
      show_alert: false,
    });
  } catch {
    // Non-critical — swallow
  }
}

/**
 * Send a message with an inline keyboard.
 */
export async function sendInlineKeyboard(
  botToken: string,
  chatId: number | string,
  text: string,
  keyboard: Array<Array<{ text: string; callback_data: string }>>,
  options?: {
    parseMode?: 'HTML' | 'MarkdownV2';
    signal?: AbortSignal;
  },
): Promise<void> {
  await telegramApiCall(botToken, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: options?.parseMode,
    reply_markup: JSON.stringify({ inline_keyboard: keyboard }),
  }, { signal: options?.signal });
}

/**
 * Set the bot's commands menu (shown in Telegram client).
 */
export async function setBotCommands(
  botToken: string,
  commands: Array<{ command: string; description: string }>,
): Promise<void> {
  await telegramApiCall(botToken, 'setMyCommands', {
    commands,
    scope: { type: 'default' },
  });
}

/**
 * Delete a message (for cleaning up old bot messages).
 */
export async function deleteMessage(
  botToken: string,
  chatId: number | string,
  messageId: number,
): Promise<void> {
  try {
    await telegramApiCall(botToken, 'deleteMessage', {
      chat_id: chatId,
      message_id: messageId,
    });
  } catch {
    // Non-critical
  }
}

/**
 * Chunk text into pieces that fit within Telegram's message limit.
 * Tries to split on newlines, then on spaces, then hard-cut.
 */
function chunkText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    let splitIndex = -1;

    // Try to split on a newline within the last 500 chars of the chunk
    const newlineIdx = remaining.lastIndexOf('\n', maxLen);
    if (newlineIdx > maxLen - 500) {
      splitIndex = newlineIdx;
    } else {
      // Try to split on a space
      const spaceIdx = remaining.lastIndexOf(' ', maxLen);
      if (spaceIdx > maxLen - 200) {
        splitIndex = spaceIdx;
      } else {
        // Hard cut
        splitIndex = maxLen;
      }
    }

    chunks.push(remaining.slice(0, splitIndex).trimEnd());
    remaining = remaining.slice(splitIndex + 1).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}