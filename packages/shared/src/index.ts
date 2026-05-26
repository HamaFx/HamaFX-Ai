// Public barrel for @hamafx/shared. Anything not exported here is private to
// the package — never reach into deep paths from consumers.

// Domain primitives
export * from './symbols';
export * from './timeframes';

// Schemas (zod + inferred types)
export * from './schemas/candle';
export * from './schemas/tick';
export * from './schemas/news';
export * from './schemas/calendar';
export * from './schemas/indicator';
export * from './schemas/chat';
export * from './schemas/alerts';
export * from './schemas/journal';

// AI tool plumbing
export * from './ai/tool-names';
export * from './ai/tool-io';

// Errors
export * from './errors';

// Env (server-only — do NOT import from client code)
export { ServerEnvSchema, parseServerEnv } from './env';
export type { ServerEnv } from './env';
