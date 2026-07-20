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

// PF-22 — Admin service layer.
//
// Handles admin-only operations: feature flags and user management.
//
// Pattern: Service (PF-22). Controllers remain thin: parse request →
// call service → format Response.

import { listFeatureFlags, upsertFeatureFlag, listUsersWithSettings, countUsers } from '@hamafx/db';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface FeatureFlagsDTO {
  features: Record<string, boolean>;
}

export interface UserListDTO {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  users: any[];
  total: number;
}

// ── Service functions ────────────────────────────────────────────────────────

export async function listFeaturesService(): Promise<FeatureFlagsDTO> {
  const rows = await listFeatureFlags();
  const features: Record<string, boolean> = {};
  for (const row of rows) {
    features[row.key] = row.enabled;
  }
  return { features };
}

export async function upsertFeaturesService(
  toggles: Record<string, boolean>,
  userId: string,
): Promise<void> {
  for (const [key, enabled] of Object.entries(toggles)) {
    await upsertFeatureFlag(key, enabled, userId);
  }
}

export async function listUsersService(
  limit: number,
  offset: number,
): Promise<UserListDTO> {
  const [users, total] = await Promise.all([
    listUsersWithSettings(limit, offset),
    countUsers(),
  ]);
  return { users, total };
}
