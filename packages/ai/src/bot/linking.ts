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

// F7 — Bot Platform: User Linking Service.
//
// Manages the mapping between a Telegram chat ID and a HamaFX user.
// Flow:
//   1. User goes to /settings → "Link Telegram" → gets a 6-char code
//   2. User sends /link <code> to the bot
//   3. Bot stores telegram_chat_id → user_id mapping in bot_links table
//
// Link codes expire after 10 minutes.
//
// See DSA_FEATURE_EXPANSION_PLAN.md §F7.4 for the design.

import { schema } from '@hamafx/db';
import { getDb } from '../db';
import { eq, and } from 'drizzle-orm';
import { randomBytes } from 'crypto';

/** Link code expiry in milliseconds (10 minutes). */
const LINK_CODE_TTL_MS = 10 * 60 * 1000;

/** In-memory store for pending link codes. In production, this could be
 * moved to Redis or a DB table for multi-instance deployments. */
interface PendingLink {
  code: string;
  userId: string;
  expiresAt: number;
}

const pendingLinks = new Map<string, PendingLink>();

/** Generate a 6-character alphanumeric link code. */
function generateLinkCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  const bytes = randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) {
    const byte = bytes[i];
    if (byte !== undefined) {
      const char = chars[byte % chars.length];
      if (char !== undefined) {
        code += char;
      }
    }
  }
  return code;
}

/**
 * Create a pending link code for a user.
 * The user sends this code to the bot via /link <code>.
 * Returns the code and its expiry time.
 */
export function createLinkCode(userId: string): { code: string; expiresAt: Date } {
  // Invalidate any existing pending code for this user
  for (const [key, link] of pendingLinks) {
    if (link.userId === userId) {
      pendingLinks.delete(key);
    }
  }

  const code = generateLinkCode();
  const expiresAt = Date.now() + LINK_CODE_TTL_MS;

  pendingLinks.set(code, { code, userId, expiresAt });

  return { code, expiresAt: new Date(expiresAt) };
}

/**
 * Attempt to link a Telegram chat ID to a HamaFX user using a link code.
 * Called when the user sends /link <code> to the bot.
 *
 * Returns the userId if successful, null if the code is invalid/expired.
 */
export async function resolveLinkCode(
  code: string,
  chatId: string,
  platform: string = 'telegram',
): Promise<string | null> {
  const upperCode = code.toUpperCase().trim();
  const pending = pendingLinks.get(upperCode);

  if (!pending) {
    return null;
  }

  // Check expiry
  if (Date.now() > pending.expiresAt) {
    pendingLinks.delete(upperCode);
    return null;
  }

  // Link the user in the database
  const db = getDb();
  await db
    .insert(schema.botLinks)
    .values({
      userId: pending.userId,
      platform,
      chatId: String(chatId),
    })
    .onConflictDoUpdate({
      target: [schema.botLinks.platform, schema.botLinks.chatId],
      set: {
        userId: pending.userId,
        linkedAt: new Date(),
      },
    });

  // Clean up the pending code
  pendingLinks.delete(upperCode);

  return pending.userId;
}

/**
 * Resolve a Telegram chat ID to a HamaFX user ID.
 * Used by the webhook handler to determine if a message is from a linked user.
 *
 * Returns the userId if linked, null otherwise.
 */
export async function resolveBotUser(
  chatId: string | number,
  platform: string = 'telegram',
): Promise<string | null> {
  const db = getDb();
  const [link] = await db
    .select({ userId: schema.botLinks.userId })
    .from(schema.botLinks)
    .where(
      and(
        eq(schema.botLinks.platform, platform),
        eq(schema.botLinks.chatId, String(chatId)),
      ),
    )
    .limit(1);

  return link?.userId ?? null;
}

/**
 * Unlink a bot platform from a user.
 * Called from the settings page when the user clicks "Unlink Telegram".
 */
export async function unlinkBot(
  userId: string,
  platform: string = 'telegram',
): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.botLinks)
    .where(
      and(
        eq(schema.botLinks.userId, userId),
        eq(schema.botLinks.platform, platform),
      ),
    );
}

/**
 * Get the linked bot info for a user (if any).
 */
export async function getBotLink(
  userId: string,
  platform: string = 'telegram',
): Promise<{ chatId: string; linkedAt: Date } | null> {
  const db = getDb();
  const [link] = await db
    .select({ chatId: schema.botLinks.chatId, linkedAt: schema.botLinks.linkedAt })
    .from(schema.botLinks)
    .where(
      and(
        eq(schema.botLinks.userId, userId),
        eq(schema.botLinks.platform, platform),
      ),
    )
    .limit(1);

  return link ?? null;
}
