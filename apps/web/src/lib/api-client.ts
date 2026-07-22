// SPDX-License-Identifier: Apache-2.0

// H-3 audit fix: typed client for non-React-Query API calls.
//
// Before this wrapper, 30+ components duplicated one of three error-handling
// patterns:
//   1. `if (!res.ok) throw new Error(await res.text())`             (admin)
//   2. `if (!res.ok) { const body = await res.json().catch(() => null);`
//      `  throw new Error(body?.error?.message ?? \`HTTP ${res.status}\`) }` (forms)
//   3. `if (!res.ok) throw new Error(\`HTTP ${res.status}\`)`          (various)
//
// `apiFetch<T>` consolidates these into one typed call site:
//   - Wraps `fetchCsrf` so state-changing requests get the X-CSRF-Token
//     header automatically.
//   - Parses the standard error envelope from `src/lib/api.ts`:
//         { error: { code, message, details?, requestId? } }
//   - Throws a typed `ApiError` with `code`, `status`, `requestId`, and
//     `details` — callers can `catch (e) { if (e instanceof ApiError) ... }`
//     or just use `e.message` (which carries the server's message).
//   - Supports `signal` (for AbortController) and `timeout` (default 10s).
//   - Optional `json: false` returns the raw Response for download/blob
//     endpoints (e.g. thread export).
//
// This is the client-side counterpart to `market-client.ts` (which is
// scoped to /api/market/* and includes retry/backoff logic tailored to
// live price polling). `apiFetch` is the general-purpose wrapper for
// everything else.

import { fetchCsrf, withCsrf } from './csrf';
import { REQUEST_ID_HEADER } from './request-id';

// ── Types ──────────────────────────────────────────────────────────────

/** Shape of the error body inside the standard `{ error: {...} }` envelope. */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

/**
 * Typed error thrown by `apiFetch` when the response is not ok.
 *
 * - `code`: the server's error code (e.g. 'UNAUTHORIZED', 'VALIDATION',
 *   'PROVIDER_ERROR'). See `packages/shared/src/errors.ts` for the full
 *   `ErrorCode` union — we keep it as `string` here so this client doesn't
 *   need to import the server-only enum.
 * - `status`: the HTTP status code.
 * - `requestId`: the `x-request-id` header value, if present. Surface this
 *   in user-facing toast descriptions so bug reports are traceable.
 * - `details`: optional structured details (e.g. zod validation flatten).
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.code = body.code;
    this.status = status;
    if (body.requestId !== undefined) this.requestId = body.requestId;
    if (body.details !== undefined) this.details = body.details;
  }
}

// ── Options ────────────────────────────────────────────────────────────

export interface ApiFetchOptions {
  /** AbortSignal for cancellation. Passed through to fetch. */
  signal?: AbortSignal;
  /** Request timeout in ms. Default 10s. Throws ApiError on timeout. */
  timeout?: number;
  /**
   * If false, return the raw Response instead of parsing JSON. Use for
   * download/blob endpoints (e.g. /api/chat/threads/[id]/export). The
   * caller is responsible for checking `res.ok`. Default true.
   */
  json?: boolean;
  /**
   * If true, skip the automatic CSRF header injection. Only set this for
   * GET requests to public endpoints that don't need CSRF (rare). Default
   * false — CSRF is always injected for safety; the server ignores the
   * header on GET anyway.
   */
  skipCsrf?: boolean;
  /**
   * Number of retries on transient network/timeout errors. Default 0.
   * Server-side 4xx/5xx errors are not retried.
   */
  retries?: number;
}

// ── Internal helpers ───────────────────────────────────────────────────

/** Race fetch against a timeout. Returns the Response or throws on timeout. */
async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  // If the caller already provided a signal, we need to compose it with
  // our timeout signal so either one can abort the request.
  const callerSignal = init.signal;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // If the caller's signal fires, abort ours too. We save the listener
  // reference so we can remove it in the finally block — without this,
  // a long-lived caller signal (e.g. from a React Query context) would
  // accumulate listeners across repeated fetch calls.
  let abortListener: (() => void) | undefined;
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      abortListener = () => controller.abort();
      callerSignal.addEventListener('abort', abortListener, { once: true });
    }
  }

  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    return res;
  } catch (err) {
    // Distinguish timeout abort from caller abort from network error.
    if (controller.signal.aborted && !callerSignal?.aborted) {
      throw new ApiError(0, {
        code: 'TIMEOUT',
        message: `Request timed out after ${timeoutMs}ms`,
      });
    }
    if (err instanceof Error && err.name === 'AbortError') {
      // Caller aborted — re-throw the original AbortError so callers
      // that check `signal.aborted` continue to work.
      throw err;
    }
    // Network error (DNS, connection refused, offline, etc.)
    throw new ApiError(0, {
      code: 'NETWORK_ERROR',
      message:
        err instanceof Error
          ? `Network error: ${err.message}`
          : 'Network request failed',
    });
  } finally {
    clearTimeout(timeoutId);
    // Clean up the event listener to prevent leaks on long-lived signals.
    if (abortListener && callerSignal) {
      callerSignal.removeEventListener('abort', abortListener);
    }
  }
}

/**
 * Parse the error envelope from a non-2xx response. Tries JSON first
 * (the standard envelope), falls back to raw text, then a generic
 * `HTTP {status}` message.
 */
async function parseErrorBody(res: Response): Promise<ApiErrorBody> {
  const requestId = res.headers.get(REQUEST_ID_HEADER) ?? undefined;

  // Try the standard JSON envelope first.
  try {
    const text = await res.text();
    if (text) {
      const json = JSON.parse(text) as { error?: Partial<ApiErrorBody> } | null;
      const err = json?.error;
      if (err && typeof err.message === 'string') {
        return {
          code: typeof err.code === 'string' ? err.code : 'UNKNOWN',
          message: err.message,
          ...(err.details !== undefined ? { details: err.details } : {}),
          ...(requestId !== undefined ? { requestId } : {}),
        };
      }
      // JSON but not the expected envelope — surface the raw text.
      return {
        code: 'HTTP_ERROR',
        message: text.slice(0, 200) || `HTTP ${res.status}`,
        ...(requestId !== undefined ? { requestId } : {}),
      };
    }
  } catch {
    // Not JSON — fall through to the generic message below.
  }

  return {
    code: 'HTTP_ERROR',
    message: `HTTP ${res.status}`,
    ...(requestId !== undefined ? { requestId } : {}),
  };
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Typed fetch wrapper for `/api/*` endpoints.
 *
 * Usage (GET):
 *   const data = await apiFetch<{ runs: CronRun[] }>('/api/admin/cron-history?days=7');
 *
 * Usage (POST with CSRF — automatic):
 *   const result = await apiFetch<{ ok: true }>('/api/admin/features', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ [key]: next }),
 *   });
 *
 * Usage (download — raw Response):
 *   const res = await apiFetch('/api/chat/threads/x/export', { json: false });
 *   if (!res.ok) { ... }
 *   const blob = await res.blob();
 *
 * Throws `ApiError` on non-2xx responses, timeouts, and network errors.
 * The error's `.message` carries the server's message (or a synthetic
 * one for timeouts/network failures). `.requestId` is present when the
 * server echoed the x-request-id header — include it in user-facing
 * toast descriptions for traceability.
 */
export async function apiFetch<T = unknown>(
  input: RequestInfo | URL,
  init: RequestInit & ApiFetchOptions = {},
): Promise<T> {
  const {
    signal,
    timeout = 10_000,
    json = true,
    skipCsrf = false,
    retries = 0,
    ...restInit
  } = init;

  // Compose the final RequestInit. `withCsrf` adds the X-CSRF-Token
  // header if a token is available; we use it directly so we can merge
  // in our timeout signal without a double-fetch.
  // Note: under `exactOptionalPropertyTypes`, `RequestInit.signal` is
  // `AbortSignal | null` (not `| undefined`), so we only spread `signal`
  // when it's actually defined.
  const baseInit: RequestInit = {
    ...restInit,
    ...(signal !== undefined ? { signal } : {}),
  };
  const finalInit = skipCsrf ? baseInit : withCsrf(baseInit);

  let delay = 200;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchWithTimeout(input, finalInit, timeout);

      // Raw Response mode — caller handles non-2xx.
      if (!json) {
        return res as unknown as T;
      }

      if (!res.ok) {
        const body = await parseErrorBody(res);
        throw new ApiError(res.status, body);
      }

      // 2xx — parse JSON. An empty 204 No Content returns null.
      const text = await res.text();
      if (!text) return null as unknown as T;
      try {
        return JSON.parse(text) as T;
      } catch (err) {
        const parseRequestId = res.headers.get(REQUEST_ID_HEADER) ?? undefined;
        throw new ApiError(res.status, {
          code: 'PARSE_ERROR',
          message: `Failed to parse response JSON: ${err instanceof Error ? err.message : String(err)}`,
          ...(parseRequestId !== undefined ? { requestId: parseRequestId } : {}),
        });
      }
    } catch (err) {
      // Server-side errors and caller aborts are not retried.
      const isAbort = err instanceof Error && err.name === 'AbortError';
      if (isAbort) throw err;
      if (err instanceof ApiError) {
        const isRetryable = err.code === 'TIMEOUT' || err.code === 'NETWORK_ERROR';
        if (!isRetryable) throw err;
      }
      if (i === retries) throw err;

      console.warn(
        `[api-client] Fetch failed (attempt ${i + 1}/${retries + 1}). Retrying in ${delay}ms...`,
        err,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }

  throw new Error('All retries failed');
}

/**
 * Convenience for state-changing requests (POST/PUT/PATCH/DELETE).
 * Identical to `apiFetch` but always injects CSRF (even if `skipCsrf`
 * is passed, it's ignored — state changes must be CSRF-protected).
 *
 * Provided as a named export for readability at call sites:
 *   await apiMutate('/api/alerts', { method: 'POST', body: ... });
 */
export async function apiMutate<T = unknown>(
  input: RequestInfo | URL,
  init: RequestInit & ApiFetchOptions = {},
): Promise<T> {
  // apiMutate is intent-signaling: it MUST be used for state-changing
  // requests. GETs are reads and have no business being "mutations".
  if (init.method?.toUpperCase() === 'GET') {
    return Promise.reject(
      new TypeError('apiMutate cannot be used for GET requests; use apiFetch instead.'),
    );
  }
  // Force skipCsrf=false — mutations always need CSRF.
  return apiFetch<T>(input, { ...init, skipCsrf: false });
}

export { fetchCsrf, withCsrf };
export { parseErrorBody };
