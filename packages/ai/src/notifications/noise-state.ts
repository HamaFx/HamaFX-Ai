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

// F4 — Notification Noise Control Persistence
//
// DB-backed noise state using the notification_noise_state table.
// This replaces the in-memory state for multi-instance deployments
// (Vercel/Docker) so all instances share the same dedup/cooldown view.
//
// Noise config and route config are stored as JSONB in the existing
// user_settings table (notificationPreferences field).

import { getDb, schema } from '@hamafx/db';
import { and, eq, lt } from 'drizzle-orm';

import type { NoiseState } from './noise-control';
import type { NoiseConfig, RouteConfig } from '@hamafx/shared';
import { DEFAULT_NOISE_CONFIG, DEFAULT_ROUTE_CONFIG } from '@hamafx/shared';

// ---------------------------------------------------------------------------
// DB-backed noise state
// ---------------------------------------------------------------------------

export class DbNoiseState implements NoiseState {
  constructor(private userId: string) {}

  async hasSeen(dedupKey: string, _ttlSeconds: number): Promise<boolean> {
    const db = getDb();
    const rows = await db
      .select({ expiresAt: schema.notificationNoiseState.expiresAt })
      .from(schema.notificationNoiseState)
      .where(
        and(
          eq(schema.notificationNoiseState.userId, this.userId),
          eq(schema.notificationNoiseState.dedupKey, dedupKey),
        ),
      )
      .limit(1);
    // If the entry exists and hasn't expired, it's a duplicate
    return rows.length > 0 && rows[0]!.expiresAt > new Date();
  }

  async inCooldown(cooldownKey: string, cooldownSeconds: number): Promise<boolean> {
    const db = getDb();
    const cutoff = new Date(Date.now() - cooldownSeconds * 1000);
    const rows = await db
      .select({ lastSentAt: schema.notificationNoiseState.lastSentAt })
      .from(schema.notificationNoiseState)
      .where(
        and(
          eq(schema.notificationNoiseState.userId, this.userId),
          eq(schema.notificationNoiseState.routeType, cooldownKey),
        ),
      )
      .limit(1);
    return rows.length > 0 && rows[0]!.lastSentAt > cutoff;
  }

  async record(dedupKey: string, cooldownKey: string): Promise<void> {
    const db = getDb();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h expiry

    await db
      .insert(schema.notificationNoiseState)
      .values({
        userId: this.userId,
        dedupKey,
        routeType: cooldownKey,
        lastSentAt: now,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [schema.notificationNoiseState.userId, schema.notificationNoiseState.dedupKey],
        set: {
          routeType: cooldownKey,
          lastSentAt: now,
          expiresAt,
        },
      });
  }

  /** Purge expired entries — call from a cron or periodic cleanup. */
  static async purgeExpired(): Promise<number> {
    const db = getDb();
    const result = await db
      .delete(schema.notificationNoiseState)
      .where(lt(schema.notificationNoiseState.expiresAt, new Date()));
    return (result as { count?: number }).count ?? (result as { rowCount?: number }).rowCount ?? 0;
  }
}

// ---------------------------------------------------------------------------
// Noise config persistence — stored in user_settings.notificationPreferences
// ---------------------------------------------------------------------------

interface NotificationPreferencesWithNoise {
  noiseConfig?: NoiseConfig;
  routeConfig?: RouteConfig;
  // Existing notification prefs (event × channel matrix) are also here
  [key: string]: unknown;
}

export async function getNoiseConfig(userId: string): Promise<NoiseConfig> {
  const db = getDb();
  const rows = await db
    .select({ notificationPreferences: schema.userSettings.notificationPreferences })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId))
    .limit(1);

  const prefs = rows[0]?.notificationPreferences as NotificationPreferencesWithNoise | null;
  if (prefs?.noiseConfig) {
    return { ...DEFAULT_NOISE_CONFIG, ...prefs.noiseConfig };
  }
  return DEFAULT_NOISE_CONFIG;
}

export async function saveNoiseConfig(
  userId: string,
  config: Partial<NoiseConfig>,
): Promise<NoiseConfig> {
  const current = await getNoiseConfig(userId);
  const merged = { ...current, ...config };

  const db = getDb();
  // Fetch current prefs, merge noise config, save back
  const rows = await db
    .select({ notificationPreferences: schema.userSettings.notificationPreferences })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId))
    .limit(1);

  const existing = (rows[0]?.notificationPreferences ?? {}) as NotificationPreferencesWithNoise;
  const updated: NotificationPreferencesWithNoise = {
    ...existing,
    noiseConfig: merged,
  };

  await db
    .insert(schema.userSettings)
    .values({
      userId,
      notificationPreferences: updated,
    })
    .onConflictDoUpdate({
      target: schema.userSettings.userId,
      set: { notificationPreferences: updated },
    });

  return merged;
}

export async function getRouteConfig(userId: string): Promise<RouteConfig> {
  const db = getDb();
  const rows = await db
    .select({ notificationPreferences: schema.userSettings.notificationPreferences })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId))
    .limit(1);

  const prefs = rows[0]?.notificationPreferences as NotificationPreferencesWithNoise | null;
  if (prefs?.routeConfig) {
    return { ...DEFAULT_ROUTE_CONFIG, ...prefs.routeConfig };
  }
  return DEFAULT_ROUTE_CONFIG;
}

export async function saveRouteConfig(
  userId: string,
  config: Partial<RouteConfig>,
): Promise<RouteConfig> {
  const current = await getRouteConfig(userId);
  const merged = { ...current, ...config };

  const db = getDb();
  const rows = await db
    .select({ notificationPreferences: schema.userSettings.notificationPreferences })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId))
    .limit(1);

  const existing = (rows[0]?.notificationPreferences ?? {}) as NotificationPreferencesWithNoise;
  const updated: NotificationPreferencesWithNoise = {
    ...existing,
    routeConfig: merged,
  };

  await db
    .insert(schema.userSettings)
    .values({
      userId,
      notificationPreferences: updated,
    })
    .onConflictDoUpdate({
      target: schema.userSettings.userId,
      set: { notificationPreferences: updated },
    });

  return merged;
}