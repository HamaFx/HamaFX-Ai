// Barrel for all tables. drizzle.config.ts points its `schema` field here.
// Order matters only for readability; FKs are resolved by name.

export * from './_extensions.js';
export * from './chat.js';
export * from './alerts.js';
export * from './journal.js';
export * from './news.js';
export * from './calendar.js';
export * from './snapshots.js';
export * from './telemetry.js';
