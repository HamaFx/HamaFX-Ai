// Soft binding to Vercel's `waitUntil`.
//
// Vercel's serverless runtime kills `void`-fired promises when the
// response stream closes — the function instance can be recycled at any
// point after the last byte is sent. `waitUntil` from `@vercel/functions`
// hands a promise to the platform so the work runs to completion (up to
// `maxDuration`) even after the response is over.
//
// We don't take a hard dep on `@vercel/functions` because `@hamafx/ai`
// must remain consumable from the worker (which runs on a plain
// Node/systemd box and has no Vercel runtime). Resolution is dynamic:
// the first call resolves the binding once and caches it. Outside
// Vercel the binding falls back to a tiny shim that fires the promise
// with a `console.warn` on rejection.
//
// Phase 2 hardening §8.

type WaitUntilFn = (promise: Promise<unknown>) => void;

let cached: WaitUntilFn | null = null;
let resolved = false;

async function resolveWaitUntil(): Promise<WaitUntilFn> {
  if (cached) return cached;
  if (!resolved) {
    resolved = true;
    try {
      // The webpackIgnore comment keeps this dynamic at bundle time so
      // packages that depend on `@hamafx/ai` (the worker, scripts) don't
      // need to install `@vercel/functions`.
      const specifier = '@vercel/functions';
      const mod = (await import(/* webpackIgnore: true */ specifier)) as {
        waitUntil?: WaitUntilFn;
      };
      if (typeof mod?.waitUntil === 'function') {
        cached = mod.waitUntil;
        return cached;
      }
    } catch {
      // Fall through to the shim — module isn't installed (worker / tests).
    }
    cached = (p) => {
      p.catch((err) => console.warn('[ai] background promise rejected', err));
    };
  }
  return cached ?? ((p) => void p);
}

/**
 * Defer `promise` so it runs to completion regardless of when the
 * response stream closes. On Vercel this surfaces as
 * `@vercel/functions/waitUntil`; elsewhere it's a fire-and-forget
 * `void` with a rejection logger.
 */
export function waitUntil(promise: Promise<unknown>): void {
  void resolveWaitUntil().then((fn) => fn(promise));
}
