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

// F4 — Notification Noise Control Engine
//
// Pure logic for dedup, cooldown, quiet hours, and severity filtering.
// DB-agnostic — operates on in-memory state that the caller provides.
// The persistence layer (noise-state.ts) wraps this with DB-backed state.
//
// Ported from DSA's `notification_noise.py` and adapted for TypeScript.
//
// See DSA_FEATURE_EXPANSION_PLAN.md §F4 for the full design.

import {
  type NoiseConfig,
  type NoiseDecision,
  type RouteType,
  type Severity,
  severityRank,
} from '@hamafx/shared';

// ---------------------------------------------------------------------------
// State abstraction — the caller provides a simple key-value store
// ---------------------------------------------------------------------------

export interface NoiseState {
  hasSeen(dedupKey: string, ttlSeconds: number): Promise<boolean> | boolean;
  inCooldown(cooldownKey: string, cooldownSeconds: number): Promise<boolean> | boolean;
  record(dedupKey: string, cooldownKey: string): Promise<void> | void;
}

// ---------------------------------------------------------------------------
// Content hashing for dedup
// ---------------------------------------------------------------------------

/**
 * Simple, fast hash for dedup keys. Not cryptographic — just needs to
 * produce a stable key from content + route type.
 */
export function hashContent(content: string, routeType: RouteType): string {
  // FNV-1a hash — fast, good distribution for short strings
  let hash = 2166136261;
  const input = `${routeType}:${content}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // Convert to unsigned hex string
  return (hash >>> 0).toString(16);
}

// ---------------------------------------------------------------------------
// Quiet hours detection
// ---------------------------------------------------------------------------

/**
 * Check if the current time falls within quiet hours.
 * Supports overnight ranges (e.g. 22:00-07:00).
 *
 * @param quietHours - { start: "22:00", end: "07:00" } or null
 * @param timezone - IANA timezone string (e.g. "UTC", "America/New_York")
 * @param now - override for testing
 */
export function isQuietHours(
  quietHours: { start: string; end: string } | null,
  timezone: string,
  now: Date = new Date(),
): boolean {
  if (!quietHours) return false;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const hourPart = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const minutePart = parts.find((p) => p.type === 'minute')?.value ?? '0';
  const currentMinutes = parseInt(hourPart, 10) * 60 + parseInt(minutePart, 10);

  const [startH = 0, startM = 0] = quietHours.start.split(':').map(Number);
  const [endH = 0, endM = 0] = quietHours.end.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    // Same-day range (e.g. 09:00-17:00)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight range (e.g. 22:00-07:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

// ---------------------------------------------------------------------------
// Core noise evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate whether a notification should be sent based on:
 *   1. Dedup — suppress identical content within TTL window
 *   2. Quiet hours — suppress below min severity during quiet hours
 *   3. Min severity — suppress below configured minimum
 *   4. Cooldown — suppress same route type within cooldown window
 *
 * If allowed, the state is recorded (dedup key + cooldown key) so
 * subsequent calls within the window are suppressed.
 */
export async function evaluateNoise(
  content: string,
  routeType: RouteType,
  severity: Severity,
  config: NoiseConfig,
  state: NoiseState,
): Promise<NoiseDecision> {
  // 1. Dedup: hash content, check if seen within dedupTtl
  const dedupKey = hashContent(content, routeType);
  if (await state.hasSeen(dedupKey, config.dedupTtlSeconds)) {
    return {
      shouldSend: false,
      reasonCode: 'duplicate',
      message: 'Duplicate suppressed',
      dedupKey,
      cooldownKey: null,
    };
  }

  // 2. Quiet hours check
  if (isQuietHours(config.quietHours, config.timezone)) {
    if (severityRank(severity) < severityRank(config.minSeverityDuringQuietHours)) {
      return {
        shouldSend: false,
        reasonCode: 'quiet_hours',
        message: 'Suppressed during quiet hours',
        dedupKey,
        cooldownKey: null,
      };
    }
  }

  // 3. Min severity
  if (severityRank(severity) < severityRank(config.minSeverity)) {
    return {
      shouldSend: false,
      reasonCode: 'below_min_severity',
      message: 'Below min severity',
      dedupKey,
      cooldownKey: null,
    };
  }

  // 4. Cooldown per route type
  const cooldownKey = routeType;
  if (config.cooldownSeconds > 0 && await state.inCooldown(cooldownKey, config.cooldownSeconds)) {
    return {
      shouldSend: false,
      reasonCode: 'cooldown',
      message: 'In cooldown',
      dedupKey,
      cooldownKey,
    };
  }

  // All checks passed — record state and allow
  await state.record(dedupKey, cooldownKey);

  return {
    shouldSend: true,
    reasonCode: 'allowed',
    message: 'Allowed',
    dedupKey,
    cooldownKey,
  };
}

// ---------------------------------------------------------------------------
// In-memory state implementation (for single-instance or testing)
// ---------------------------------------------------------------------------

export class InMemoryNoiseState implements NoiseState {
  private seen = new Map<string, number>(); // dedupKey → timestamp
  private cooldowns = new Map<string, number>(); // cooldownKey → timestamp

  async hasSeen(dedupKey: string, ttlSeconds: number): Promise<boolean> {
    const now = Date.now();
    const last = this.seen.get(dedupKey);
    if (last === undefined) return false;
    if (now - last > ttlSeconds * 1000) {
      this.seen.delete(dedupKey);
      return false;
    }
    return true;
  }

  async inCooldown(cooldownKey: string, cooldownSeconds: number): Promise<boolean> {
    const now = Date.now();
    const last = this.cooldowns.get(cooldownKey);
    if (last === undefined) return false;
    if (now - last > cooldownSeconds * 1000) {
      this.cooldowns.delete(cooldownKey);
      return false;
    }
    return true;
  }

  async record(dedupKey: string, cooldownKey: string): Promise<void> {
    const now = Date.now();
    this.seen.set(dedupKey, now);
    this.cooldowns.set(cooldownKey, now);
  }

  /** Clear all state — useful for tests. */
  clear(): void {
    this.seen.clear();
    this.cooldowns.clear();
  }
}