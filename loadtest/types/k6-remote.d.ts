// Type declarations for remote jslib.k6.io imports that tsc can't resolve.
// k6 strips types at runtime so these are only needed for tsc --noEmit.
// Do NOT augment 'k6' module here — @types/k6 already handles the built-in exports.

declare module 'https://jslib.k6.io/k6-utils/1.4.0/index.js' {
  export function randomItem<T>(arr: T[]): T;
  export function uuidv4(): string;
}

declare module 'https://jslib.k6.io/k6-summary/0.1.0/index.js' {
  export function textSummary(
    data: unknown,
    options?: { indent?: string; enableColors?: boolean },
  ): string;
}
