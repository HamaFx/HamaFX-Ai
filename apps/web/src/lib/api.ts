// SPDX-License-Identifier: Apache-2.0

// Tiny helpers shared by all `/api/*` route handlers.
// Centralises:
//   - the public error envelope shape (matches docs/05-api-routes.md)
//   - zod input parsing with a friendly 400 on failure
//   - normalised provider/AppError → HTTP mapping
//   - X-Request-Id propagation (Phase 7a)
//   - Phase A: getUserFromRequest() + withAuth() for multi-user scoping
//   - PF-10: compose() middleware chain

import * as Sentry from '@sentry/nextjs';
import { ProviderError, toAppError } from '@hamafx/data';
import { AppError, type ErrorCode, validationError, formatErrorResponse } from '@hamafx/shared';
import { ZodError, type z } from 'zod';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { auth } from '@/auth';
import { createScopedLoggerWithContext } from './logger';
import { recordAuthEvent } from './auth-anomaly';
import { REQUEST_ID_HEADER } from './request-id';
import {
  getSigningSecret,
  USER_ID_HEADER,
  USER_ID_SIG_HEADER,
} from './signed-user-header';

// ── Auth helpers (Phase A) ─────────────────────────────────────────────────

export interface RequestUser {
  userId: string;
  email?: string | null;
  name?: string | null;
}

/**
 * Extract the authenticated user from the request.
 *
 * Fast path: reads `x-user-id` header injected by middleware (Edge, no DB).
 * Slow path: calls `auth()` for defense-in-depth (Node, reads JWT cookie).
 *
 * Returns null when neither path resolves — caller should 401.
 */
export async function getUserFromRequest(req: Request): Promise<RequestUser | null> {
  // Fast path: middleware already validated the session and set the
  // signed header. Verify the HMAC before trusting it — a spoofed
  // x-user-id without a valid signature falls through to auth() below.
  // SEC-1: defense-in-depth against header impersonation.
  const headerId = req.headers.get(USER_ID_HEADER);
  if (headerId) {
    const sig = req.headers.get(USER_ID_SIG_HEADER);
    const secret = getSigningSecret();
    if (sig && secret) {
      const requestId = req.headers.get(REQUEST_ID_HEADER);
      if (requestId) {
        // Verify HMAC using node:crypto (Node.js runtime only).
        // Static import — api.ts is NOT used in Edge middleware.
        const expected = createHmac('sha256', secret.slice(0, 128))
          .update(`${headerId}.${requestId}`)
          .digest('hex');
        if (
          expected.length === sig.length &&
          timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
        ) {
          return { userId: headerId };
        }
      }
      // Signature missing or invalid — treat as untrusted, fall through
      // to the auth() slow path below. Do NOT return the header value.
    }
    // If secret is missing or signature is absent, fall through to
    // the auth() slow path. This is safe: the header is untrusted
    // without a verifiable signature.
  }

  // Slow path: call NextAuth directly (admin routes, defense-in-depth)
  try {
    const session = await auth();
    if (session?.user?.id) {
      // Build the object conditionally to satisfy exactOptionalPropertyTypes:
      // RequestUser allows `string | null` but not `undefined` for optional
      // fields, so we omit email/name when they're missing entirely.
      return {
        userId: session.user.id,
        ...(session.user.email != null ? { email: session.user.email } : {}),
        ...(session.user.name != null ? { name: session.user.name } : {}),
      };
    }
  } catch {
    // auth() failed — treat as unauthenticated
  }

  // No authenticated user found — do NOT fall back to a system user.
  // Return null so withAuth() can properly reject the request with 401.
  return null;
}

/**
 * Higher-order wrapper for route handlers that require authentication.
 *
 * Usage:
 *   export const GET = withAuth(async (req, { user }) => { ... });
 *
 * Returns 401 when the user is not authenticated, with the standard
 * error envelope and X-Request-Id propagation.
 */
export function withAuth<T>(
  handler: (req: Request, ctx: { params: Promise<T>, user: RequestUser }) => Promise<Response>,
): (req: Request, ctx: { params: Promise<T> }) => Promise<Response> {
  return async (req: Request, ctx: { params: Promise<T> }) => {
    const user = await getUserFromRequest(req);
    if (!user) {
      // OBS-12 (Phase 5.4): Track 401s for auth anomaly detection
      recordAuthEvent('unauthorized_401');
      const requestId = readRequestId(req);
      const headers: Record<string, string> = {};
      if (requestId) headers[REQUEST_ID_HEADER] = requestId;
      return Response.json(
        {
          error: {
            code: 'UNAUTHORIZED' as const,
            message: 'Authentication required',
            ...(requestId ? { requestId } : {}),
          },
        },
        { status: 401, headers },
      );
    }
    try {
      return await handler(req, { params: ctx.params, user });
    } catch (err) {
      return errorResponse(err, req);
    }
  };
}

export interface ApiErrorBody {
  error: {
    code: ErrorCode | 'VALIDATION';
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

/** Read the request id middleware stamped onto the request. */
function readRequestId(req?: Request): string | undefined {
  return req?.headers.get(REQUEST_ID_HEADER) ?? undefined;
}

function routeTag(req?: Request): string {
  if (!req) return 'unknown';
  try {
    return new URL(req.url).pathname;
  } catch {
    return 'unknown';
  }
}

/**
 * Standardised error response. Pass `req` to echo the X-Request-Id header
 * (and embed it in the error body so the UI can show it in a bug report).
 */
export function errorResponse(err: unknown, req?: Request): Response {
  const requestId = readRequestId(req);
  const headers: Record<string, string> = {};
  if (requestId) headers[REQUEST_ID_HEADER] = requestId;
  const options = { ...(requestId ? { requestId } : {}), headers };
  const route = routeTag(req);

  if (err instanceof AppError) {
    if (err.status >= 500) {
      Sentry.captureException(err, {
        tags: { component: 'api', route, kind: 'app-error' },
        extra: { requestId, code: err.code },
      });
    }
    return formatErrorResponse(err, options);
  }
  if (err instanceof ProviderError) {
    Sentry.captureException(err, {
      tags: { component: 'api', route, kind: 'provider-error' },
      extra: { requestId, provider: err.provider },
    });
    return formatErrorResponse(toAppError(err), options);
  }
  if (err instanceof ZodError) {
    return formatErrorResponse(validationError('Invalid request', err.flatten()), options);
  }

  // PF-22: Handle rate-limit and validation errors thrown from service
  // functions as plain Error objects with a numeric `statusCode` property.
  if (err instanceof Error && typeof (err as unknown as Record<string, unknown>).statusCode === 'number') {
    const statusCode = (err as unknown as Record<string, unknown>).statusCode as number;
    const extraHeaders = (err as unknown as Record<string, unknown>).headers as Record<string, string> | undefined;
    return Response.json(
      {
        error: {
          code: statusCode === 429 ? 'RATE_LIMITED' : 'VALIDATION',
          message: err.message,
          ...(requestId ? { requestId } : {}),
        },
      },
      { status: statusCode, headers: { ...headers, ...extraHeaders } },
    );
  }

  Sentry.captureException(err, {
    tags: { component: 'api', route, kind: 'unhandled-error' },
    extra: { requestId },
  });
  createScopedLoggerWithContext({ component: 'api', route, requestId }).error(
    { err: String(err) },
    'unhandled error',
  );
  return formatErrorResponse(err, options);
}

/** Parse `URLSearchParams` against a zod schema, throwing on invalid input. */
export function parseSearchParams<S extends z.ZodTypeAny>(req: Request, schema: S): z.infer<S> {
  const url = new URL(req.url);
  const params: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) params[k] = v;
  return schema.parse(params) as z.infer<S>;
}

/**
 * Hard cap on raw request body size for `parseJsonBody`. Vercel's serverless
 * function body limit is 4.5 MB, but the in-process Node runtime has no
 * intrinsic bound. The chat composer can attach 4 × 5 MB images encoded as
 * base64 data URLs (~27 MB inflated), so the cap exists primarily to
 * surface a clean 400 long before we OOM the function.
 *
 * Tune via `MAX_JSON_BODY_BYTES` env var if needed; defaults to 6 MiB.
 */
const DEFAULT_MAX_BODY_BYTES = 6 * 1024 * 1024;

function maxJsonBodyBytes(): number {
  const raw = process.env.MAX_JSON_BODY_BYTES;
  if (!raw) return DEFAULT_MAX_BODY_BYTES;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_BODY_BYTES;
  return Math.floor(n);
}

// ── PF-10: Middleware chain ───────────────────────────────────────────────────

/**
 * A middleware function in the chain.
 * Takes a request + context and returns a Response or delegates to `next`.
 */
export type Middleware<T, R> = (
  req: Request,
  ctx: { params: Promise<T> } & R,
  next: () => Promise<Response>,
) => Promise<Response>;

/**
 * Compose multiple middleware functions into a single handler.
 *
 * Middleware executes left-to-right. Each middleware can:
 *   - Short-circuit by returning a Response directly
 *   - Delegate to the next middleware by calling `await next()`
 *
 * The innermost middleware is the actual route handler.
 *
 * @example
 * ```ts
 * const GET = compose(
 *   withAuth,
 *   rateLimit(100, '1m'),
 *   async (req, { user }) => {
 *     return Response.json({ hello: user.userId });
 *   },
 * );
 * ```
 */
export function compose<T, R extends Record<string, unknown> = Record<string, unknown>>(
  ...middlewares: Array<
    Middleware<T, R>
  >
): (req: Request, ctx: { params: Promise<T> }) => Promise<Response> {
  return async (req: Request, ctx: { params: Promise<T> }): Promise<Response> => {
    let index = -1;

    const dispatch = async (i: number): Promise<Response> => {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      index = i;

      const middleware = middlewares[i];
      if (!middleware) {
        throw new Error('No handler registered');
      }

      return middleware(
        req,
        ctx as { params: Promise<T> } & R,
        async () => dispatch(i + 1),
      );
    };

    return dispatch(0);
  };
}

/**
 * PF-10 — Make `withAuth` compatible with the `compose()` chain.
 * Returns a middleware function that extracts the user and passes
 * it downstream via context.
 */
export function authMiddleware<T>(): Middleware<T, { user: RequestUser }> {
  return async (req, ctx, next) => {
    const user = await getUserFromRequest(req);
    if (!user) {
      recordAuthEvent('unauthorized_401');
      const requestId = readRequestId(req);
      const headers: Record<string, string> = {};
      if (requestId) headers[REQUEST_ID_HEADER] = requestId;
      return Response.json(
        {
          error: {
            code: 'UNAUTHORIZED' as const,
            message: 'Authentication required',
            ...(requestId ? { requestId } : {}),
          },
        },
        { status: 401, headers },
      );
    }
    return next();
  };
}

export async function parseJsonBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<z.infer<S>> {
  const max = maxJsonBodyBytes();

  // Cheap pre-check: trust the client's Content-Length header to bail out
  // before we even start reading. Header may be missing on some streamed
  // requests; the byte-count guard below catches that case.
  const lenHeader = req.headers.get('content-length');
  if (lenHeader) {
    const declared = Number(lenHeader);
    if (Number.isFinite(declared) && declared > max) {
      throw validationError(`Payload too large (max ${max} bytes, got ${declared})`);
    }
  }

  // Stream the body so we can stop early if the client lied about the
  // length (or never set one). A 50 MB attacker payload should be killed
  // around byte ~6 MB, not after the whole thing has been buffered.
  // STAB-05: Also enforce a hard time limit on body reading (5s) to
  // prevent slow-loris-style attacks from tying up function instances.
  const BODY_READ_TIMEOUT_MS = 5_000;
  const body = req.body;
  let buf: Uint8Array;
  if (body) {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        // STAB-05: Race reader.read() against a timeout so a slow
        // client can't hold the function open indefinitely.
        const readTimeout = AbortSignal.timeout(BODY_READ_TIMEOUT_MS);
        const readResult = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            readTimeout.addEventListener(
              'abort',
              () => reject(new Error('Body read timed out')),
              { once: true },
            );
          }),
        ]);
        const { value, done } = readResult;
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > max) {
            // Drop the reader so the underlying stream can be freed.
            await reader.cancel().catch(() => undefined);
            throw validationError(`Payload too large (max ${max} bytes)`);
          }
          chunks.push(value);
        }
      }
    } catch (err) {
      // Ensure the reader is released even on timeout or overflow.
      await reader.cancel().catch(() => undefined);
      if (err instanceof Error && err.message === 'Body read timed out') {
        throw validationError('Request body read timed out');
      }
      throw err;
    }
    buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      buf.set(c, off);
      off += c.byteLength;
    }
  } else {
    // Edge runtime fallback. Shouldn't happen for App Router POST handlers.
    const txt = await req.text();
    if (txt.length > max) {
      throw validationError(`Payload too large (max ${max} bytes)`);
    }
    buf = new TextEncoder().encode(txt);
  }

  const text = buf.byteLength === 0 ? '' : new TextDecoder().decode(buf);
  let raw: unknown;
  try {
    raw = text.length === 0 ? undefined : JSON.parse(text);
  } catch (err) {
    throw validationError('Invalid JSON body', err instanceof Error ? err.message : undefined);
  }
  return schema.parse(raw) as z.infer<S>;
}
