// Public barrel for @hamafx/shared. Anything not exported here is private to
// the package — never reach into deep paths from consumers.

// Domain primitives
export * from './symbols';
export * from './timeframes';

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
// UI-only message parts (planner output, citation + verify warnings)
export * from './schemas/ui-parts';
// Briefings (cron-emitted assistant messages in the dedicated thread)
export * from './schemas/briefings';

// AI tool plumbing
export * from './ai/tool-names';
export * from './ai/tool-io';

// Errors
export * from './errors';

// Env (server-only — do NOT import from client code)
export { ServerEnvSchema, parseServerEnv, resolveDatabaseUrl } from './env';
export type { ServerEnv } from './env';
