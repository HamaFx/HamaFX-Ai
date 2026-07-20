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

// Idempotency guard for Telegram webhook updates.
//
// Telegram retries undelivered updates (up to ~100 times over 24h).
// Without dedup, a retried update can double-process commands, double-send
// alerts, or double-charge AI tokens.
//
// This module tracks processed update_ids with a TTL. In single-instance
// deployments the in-memory map is sufficient. For multi-instance / serverless,
// the interface is designed to be backed by Redis or a DB table.

const PROCESSED_TTL_MS = 5 * 60 * 1000; // 5 minutes — Telegram retries within this window
const CLEANUP_INTERVAL_MS = 60 * 1000; // Prune expired entries every minute

interface ProcessedEntry {
  updateId: number;
  processedAt: number;
}

const processed = new Map<number, ProcessedEntry>();
let lastCleanup = Date.now();

/**
 * Check if an update_id has already been processed.
 * Returns true if the update is a duplicate (should be skipped).
 */
export function isDuplicateUpdate(updateId: number): boolean {
  cleanupIfNeeded();
  return processed.has(updateId);
}

/**
 * Mark an update_id as processed.
 * Must be called after the update is fully handled.
 */
export function markProcessed(updateId: number): void {
  processed.set(updateId, {
    updateId,
    processedAt: Date.now(),
  });
}

/**
 * Prune expired entries to prevent unbounded memory growth.
 * Called automatically on each check.
 */
function cleanupIfNeeded(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [key, entry] of processed) {
    if (now - entry.processedAt > PROCESSED_TTL_MS) {
      processed.delete(key);
    }
  }
}

/**
 * Reset the idempotency guard (for testing).
 */
export function _resetForTesting(): void {
  processed.clear();
  lastCleanup = Date.now();
}

// ---------------------------------------------------------------------------
// DB-backed idempotency (for multi-instance Vercel deployments)
//
// The in-memory Map above works for single-instance deployments but is
// ineffective when Vercel runs multiple serverless instances — each
// instance has its own Map, so a retried update_id can land on a
// different instance and bypass dedup.
//
// For multi-instance production use, create a `telegram_updates` table:
//
//   CREATE TABLE IF NOT EXISTS telegram_updates (
//     update_id BIGINT PRIMARY KEY,
//     processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
//   );
//
// Then use the DbTelegramIdempotency class below, which uses
// INSERT ... ON CONFLICT DO NOTHING for atomic dedup.
//
// Cron cleanup (runs daily, deletes rows older than 1 hour):
//   DELETE FROM telegram_updates WHERE processed_at < NOW() - INTERVAL '1 hour';
// ---------------------------------------------------------------------------

import { getDb } from '../db';
import { sql } from 'drizzle-orm';

/**
 * DB-backed idempotency guard for Telegram webhook updates.
 *
 * Uses INSERT ... ON CONFLICT DO NOTHING to atomically check-and-mark
 * an update_id as processed. Requires the `telegram_updates` table
 * (see migration instructions above).
 *
 * Falls back to in-memory mode when the table doesn't exist or
 * `DATABASE_URL` is not configured (Edge runtime, local dev without DB).
 */
export class DbTelegramIdempotency {
  private fallback = new Map<number, number>();

  async isDuplicate(updateId: number): Promise<boolean> {
    try {
      const db = getDb();
      const result = await db.execute(
        sql`INSERT INTO telegram_updates (update_id) VALUES (${updateId}) ON CONFLICT (update_id) DO NOTHING RETURNING update_id`,
      );
      // If the row was inserted (not a conflict), it's not a duplicate.
      // The row count tells us: 0 = duplicate (conflict), 1 = new.
      const rows = (result as { rows?: unknown[] }).rows ?? (Array.isArray(result) ? result : []);
      return rows.length === 0;
    } catch {
      // Table doesn't exist or DB unavailable — fall back to in-memory.
      return this.fallbackCheck(updateId);
    }
  }

  private fallbackCheck(updateId: number): boolean {
    const now = Date.now();
    if (this.fallback.has(updateId)) return true;
    this.fallback.set(updateId, now);
    // Prune old entries (keep last 1000)
    if (this.fallback.size > 1000) {
      const cutoff = now - 5 * 60 * 1000;
      for (const [key, ts] of this.fallback) {
        if (ts < cutoff) this.fallback.delete(key);
      }
    }
    return false;
  }
}