// Empty stub used by the worker's vitest config to alias `server-only`.
// At production build time the real `server-only` package throws if a
// client bundle tries to import it. In Node tests we don't need that
// guard, so we replace it with a no-op.
export {};
