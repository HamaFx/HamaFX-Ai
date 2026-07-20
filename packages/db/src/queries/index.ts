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

// PF-01 — Query/repository layer barrel.
//
// All query helpers live here. Consumers import from this barrel instead
// of importing `schema` directly. This decouples high-level modules
// from Drizzle ORM internals and makes the data-access surface explicit.
//
// Namespace conventions:
//   queries.threads.getById(id, userId)  — single thread
//   queries.threads.list(userId)         — list threads
//   queries.alerts.create(input)         — create alert

export * as users from './user-settings';
export * as threads from './threads';
export * as alerts from './alerts';
export * as billing from './billing';
export * as journal from './journal';
export * as push from './push';
export * as cot from './cot';
export * as portfolio from './portfolio';
export * as telemetry from './telemetry';
export * as news from './news-articles';
export * as userSymbols from './user-symbols';
export * as toolTelemetry from './tool-telemetry';
export * as tenants from './tenants';
export * as analysisJobs from './analysis-jobs';
export * as diagnosticTraces from './diagnostic-traces';
export * as featureFlags from './feature-flags';
export * as cronRuns from './cron-runs';
export * as verificationTokens from './verification-tokens';
export * as adminUsers from './users';
export * as chatTelemetry from './chat-telemetry';
export * as watchlist from './watchlist';
export * as onboarding from './onboarding';
export * as providerTests from './provider-tests';
export * as billingExtras from './billing-extras';
export * as auth from './auth';
export * as userSessions from './user-sessions';
export * as ipnEvents from './ipn-events';
export * as candles from './candles';
export * as agentOpinions from './agent-opinions';
