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

// Phase 8 §43 — Postgres enums for fixed-value fields.
export * from './enums';

// Phase A (multi-user) — auth tables must come first because other tables
// reference users.id via foreign keys.
export * from './auth';
export * from './chat';
export * from './agent-opinions';
export * from './alerts';
export * from './journal';
export * from './news';
export * from './calendar';
export * from './snapshots';
export * from './telemetry';
export * from './tool-telemetry';
export * from './briefings';
export * from './cot';
export * from './share';
export * from './push';
export * from './memory';
export * from './daily-ai-spend';
export * from './rate-limits';
// Phase 8 — worker-driven persistence
export * from './live-ticks';
export * from './candles-1m';
export * from './throttle';
export * from './intermarket-resonance';
export * from './audit';
export * from './provider-tests';
export * from './symbol-catalog';
// STAB-01 — cron idempotency guard
export * from './cron-runs';
// DEBUG — diagnostic trace persistence
export * from './diagnostic-traces';
// Admin — runtime feature flags
export * from './feature-flags';
// F2 — Portfolio Management
export * from './portfolio';
// F4 — Notification Noise Control
export * from './noise-control';
// F7 — Bot Platform with Commands
export * from './bot-links';
// Phase A RL-2 — Shared daily provider quota counter
export * from './provider-daily-quota';
// Phase B — Billing (NOWPayments / crypto)
export * from './billing';
// U2 — Background multi-agent analysis jobs
export * from './analysis-jobs';
// Telegram webhook idempotency dedup
export * from './telegram-updates';
// H1 — Shared provider health store for cross-instance failover scoring
export * from './provider-health';
