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

// Phase 8 — Task 43: Postgres enums for fixed-value fields.
//
// These enums replace plain text columns with native Postgres enum types,
// which provides database-level validation and better tooling support.
//
// IMPORTANT: We define the enums here but the actual column type changes
// are in migration 0032. The schema files reference these enums so
// Drizzle Studio and code consumers see the correct types.
//
// Note: The existing text columns still work because Postgres can
// implicitly cast text to enum values. The migration converts the
// columns to use the enum type, and existing data is cast in-place.

import { pgEnum } from 'drizzle-orm/pg-core';

// ── User roles ──────────────────────────────────────────────────────────
export const userRoleEnum = pgEnum('user_role', ['user', 'admin']);

// ── Journal entry outcome ───────────────────────────────────────────────
export const journalOutcomeEnum = pgEnum('journal_outcome', ['open', 'win', 'loss', 'breakeven']);

// ── Portfolio position status ───────────────────────────────────────────
export const portfolioStatusEnum = pgEnum('portfolio_status', ['open', 'closed']);

// ── Briefing kind ───────────────────────────────────────────────────────
export const briefingKindEnum = pgEnum('briefing_kind', ['pre', 'post', 'weekly_review']);

// ── Bot platform ────────────────────────────────────────────────────────
export const botPlatformEnum = pgEnum('bot_platform', ['telegram', 'discord', 'slack']);