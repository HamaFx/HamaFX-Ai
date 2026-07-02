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

// Public barrel for @hamafx/shared. Anything not exported here is private to
// the package — never reach into deep paths from consumers.

// Domain primitives
export * from './symbols';
export * from './timeframes';

// F6 — Market Phase Detection
export * from './market-phase';

// Schemas (zod + inferred types)
export * from './schemas/candle';
export * from './schemas/tick';
export * from './schemas/live-tick';
export * from './schemas/biquote';
export * from './schemas/news';
export * from './schemas/calendar';
export * from './schemas/indicator';
export * from './schemas/structure';
export * from './schemas/chat';
export * from './schemas/alerts';
export * from './schemas/journal';
export * from './schemas/decision-signals';
// F2 — Portfolio Management
export * from './schemas/portfolio';
// F3 — Social Sentiment Integration
export * from './schemas/sentiment';
// F4 — Notification Noise Control
export * from './schemas/noise-control';

// Per-tool output envelope schemas (consumed by chat parts via `safeParse`).
export * from './schemas/tool-outputs/get-price';
export * from './schemas/tool-outputs/get-candles';
export * from './schemas/tool-outputs/get-indicators';
export * from './schemas/tool-outputs/get-market-structure';
export * from './schemas/tool-outputs/get-news';
export * from './schemas/tool-outputs/get-calendar';
export * from './schemas/tool-outputs/set-alert';
export * from './schemas/tool-outputs/log-journal';
// Phase 2 tools
export * from './schemas/tool-outputs/search-knowledge';
export * from './schemas/tool-outputs/analyze-technical';
export * from './schemas/tool-outputs/analyze-fundamental';
export * from './schemas/tool-outputs/get-journal-stats';
export * from './schemas/tool-outputs/annotate-chart';
// Phase 3 tools
export * from './schemas/tool-outputs/analyze-chart-image';
export * from './schemas/tool-outputs/get-correlation';
export * from './schemas/tool-outputs/get-cot';
export * from './schemas/tool-outputs/share-snapshot';
// Phase 7b tools
export * from './schemas/tool-outputs/compute-risk';
export * from './schemas/tool-outputs/get-session-levels';
export * from './schemas/tool-outputs/get-intermarket';
export * from './schemas/tool-outputs/forecast-volatility';
export * from './schemas/tool-outputs/get-seasonality';
export * from './schemas/tool-outputs/compute-position-health';
export * from './schemas/tool-outputs/replay-setup';
export * from './schemas/tool-outputs/summarize-thread';
// Phase 7c tools
export * from './schemas/tool-outputs/verify-call';
export * from './schemas/tool-outputs/convene-committee';
export * from './schemas/tool-outputs/get-intermarket-resonance';
export * from './schemas/tool-outputs/get-system-diagnostics';
export * from './schemas/tool-outputs/run-system-action';
// F2 — Portfolio Management
export * from './schemas/tool-outputs/get-portfolio-snapshot';
// F3 — Social Sentiment
export * from './schemas/tool-outputs/get-social-sentiment';
// UI-only message parts (planner output, citation + verify warnings)
export * from './schemas/ui-parts';
// Briefings (cron-emitted assistant messages in the dedicated thread)
export * from './schemas/briefings';

// AI tool plumbing
export * from './ai/tool-names';
export * from './ai/tool-io';

// Phase E — Billing feature gating
export * from './billing';

// Errors & Logging
export * from './errors';
export * from './logger';
// BYOK encryption is server-only (uses node:crypto) — import directly
// from '@hamafx/shared/encryption' instead. Re-exporting it here would
// pull node:crypto into any client component that imports the barrel.
export {} from './encryption';

// Env (server-only — do NOT import from client code)
export { ServerEnvSchema, parseServerEnv, resolveDatabaseUrl } from './env';
export type { ServerEnv } from './env';
// BYOK type re-exports (intentionally NOT pulling node:crypto into
// the client bundle).
export {
  PROVIDER_IDS,
  type ByokPayload,
  type ProviderId,
  type ProviderMeta,
  type ProviderPricingTier,
  type ModelDomain,
  type CatalogModel,
  type CatalogResponse,
} from './byok';
// Secret helpers (env-secrets.ts) intentionally NOT re-exported from the
// barrel — importing them pulls node:crypto + `server-only` into the
// client bundle. Consumers must import directly:
//   import { generateSecret } from '@hamafx/shared/env-secrets';
//
// Phase 3 §3.9 — vault secrets loader also NOT re-exported from the barrel
// (it pulls google-auth-library dynamically). Consumers must import directly:
//   import { loadSecretsFromVault } from '@hamafx/shared/vault';
