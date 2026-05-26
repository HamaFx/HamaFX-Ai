// Public barrel for @hamafx/shared. Anything not exported here is private to
// the package — never reach into deep paths from consumers.

// Domain primitives
export * from './symbols.js';
export * from './timeframes.js';

// Schemas (zod + inferred types)
export * from './schemas/candle.js';
export * from './schemas/tick.js';
export * from './schemas/news.js';
export * from './schemas/calendar.js';
export * from './schemas/indicator.js';
export * from './schemas/chat.js';
export * from './schemas/alerts.js';
export * from './schemas/journal.js';

// AI tool plumbing
export * from './ai/tool-names.js';
export * from './ai/tool-io.js';

// Errors
export * from './errors.js';

// Env (server-only — do NOT import from client code)
export { ServerEnvSchema, parseServerEnv } from './env.js';
export type { ServerEnv } from './env.js';
