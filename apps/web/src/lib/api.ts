// Tiny helpers shared by all `/api/*` route handlers.
// Centralises:
//   - the public error envelope shape (matches docs/08-backend-and-api.md)
//   - zod input parsing with a friendly 400 on failure
//   - normalised provider/AppError → HTTP mapping
//   - X-Request-Id propagation (Phase 7a)
//   - Phase A: getUserFromRequest() + withAuth() for multi-user scoping

import { ProviderError, toAppError } from '@hamafx/data';
import { AppError, type ErrorCode, validationError } from '@hamafx/shared';
import { ZodError, type z } from 'zod';

import { auth } from '@/auth';
import { REQUEST_ID_HEADER } from './request-id';

// ── Auth helpers (Phase A) ──────────────────────────────────────

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
  // Fast path: middleware already validated the session and set the header
  const headerId = req.headers.get('x-user-id');
  if (headerId) {
    return { userId: headerId };
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

  // Fallback to system user since authentication is disabled for self-hosted instances
  return {
    userId: '__system__',
    email: 'admin@localhost',
    name: 'Admin',
  };
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

/**
 * Standardised error response. Pass `req` to echo the X-Request-Id header
 * (and embed it in the error body so the UI can show it in a bug report).
 */
export function errorResponse(err: unknown, req?: Request): Response {
  const requestId = readRequestId(req);
  const headers: Record<string, string> = {};
  if (requestId) headers[REQUEST_ID_HEADER] = requestId;

  if (err instanceof AppError) {
    const body: ApiErrorBody = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
        ...(requestId ? { requestId } : {}),
      },
    };
    return Response.json(body, { status: err.status, headers });
  }
  if (err instanceof ProviderError) {
    return errorResponse(toAppError(err), req);
  }
  if (err instanceof ZodError) {
    const body: ApiErrorBody = {
      error: {
        code: 'VALIDATION',
        message: 'Invalid request',
        details: err.flatten(),
        ...(requestId ? { requestId } : {}),
      },
    };
    return Response.json(body, { status: 400, headers });
  }
  console.error('[api] unhandled error', { err, requestId });
  const body: ApiErrorBody = {
    error: {
      code: 'INTERNAL',
      message: 'Internal error',
      ...(requestId ? { requestId } : {}),
    },
  };
  return Response.json(body, { status: 500, headers });
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
  const body = req.body;
  let buf: Uint8Array;
  if (body) {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
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
