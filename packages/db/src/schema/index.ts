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

// Barrel for all tables. drizzle.config.ts points its `schema` field here.
// Order matters only for readability; FKs are resolved by name.

// Phase A (multi-user) — auth tables must come first because other tables
// reference users.id via foreign keys.
export * from './auth.js';
export * from './_extensions.js';
export * from './chat.js';
export * from './alerts.js';
export * from './journal.js';
export * from './news.js';
export * from './calendar.js';
export * from './snapshots.js';
export * from './telemetry.js';
export * from './tool-telemetry.js';
export * from './briefings.js';
export * from './cot.js';
export * from './share.js';
export * from './push.js';
export * from './memory.js';
export * from './daily-ai-spend.js';
export * from './rate-limits.js';
// Phase 8 — worker-driven persistence
export * from './live-ticks.js';
export * from './candles-1m.js';
export * from './throttle.js';
export * from './intermarket-resonance.js';
export * from './audit.js';
export * from './provider-tests.js';
export * from './symbol-catalog.js';
