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