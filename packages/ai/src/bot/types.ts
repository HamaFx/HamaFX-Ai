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

// F7 — Bot Platform: Core types and interfaces.
//
// See DSA_FEATURE_EXPANSION_PLAN.md §F7.3 for the architecture design.

/** The bot platform. Extensible to discord/slack later. */
export type BotPlatform = 'telegram';

/** Context passed to every command handler. */
export interface BotContext {
  /** Resolved HamaFX user ID from the bot_links table. */
  userId: string;
  /** The chat ID on the bot platform (e.g. Telegram chat ID). */
  chatId: string;
  /** The platform name. */
  platform: BotPlatform;
  /** The bot token for sending responses back. */
  botToken?: string;
}

/** A bot response — either text or an image (for /chart). */
export interface BotResponse {
  text?: string;
  /** Base64-encoded image data for chart snapshots. */
  image?: string;
  /** Caption for the image. */
  imageCaption?: string;
  /** Parse mode for Telegram (default: undefined = plain text). */
  parseMode?: 'HTML' | 'MarkdownV2' | undefined;
}

/** A registered bot command. */
export interface BotCommand {
  name: string;
  aliases: string[];
  description: string;
  handler: (args: string[], ctx: BotContext) => Promise<BotResponse>;
}

/** Parsed command from raw text. */
export interface ParsedCommand {
  command: string;
  args: string[];
}

/**
 * Parse a raw message text into a command name and arguments.
 * "/analyze XAUUSD" → { command: 'analyze', args: ['XAUUSD'] }
 * "/price EURUSD" → { command: 'price', args: ['EURUSD'] }
 */
export function parseCommand(text: string): ParsedCommand {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) {
    return { command: '', args: [] };
  }

  // Remove leading slash, split by whitespace
  const parts = trimmed.slice(1).split(/\s+/);
  const first = parts[0];
  if (!first) {
    return { command: '', args: [] };
  }
  const command = first.toLowerCase().replace(/@\w+$/, ''); // strip @botname suffix
  const args = parts.slice(1).filter(Boolean);

  return { command, args };
}
