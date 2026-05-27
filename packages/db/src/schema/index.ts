// Barrel for all tables. drizzle.config.ts points its `schema` field here.
// Order matters only for readability; FKs are resolved by name.

export * from './_extensions';
export * from './chat';
export * from './alerts';
export * from './journal';
export * from './news';
export * from './calendar';
export * from './snapshots';
export * from './telemetry';
export * from './briefings';
export * from './cot';
export * from './share';
export * from './push';
