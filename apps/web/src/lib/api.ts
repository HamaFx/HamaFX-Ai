// Tiny helpers shared by all `/api/market/*` route handlers.
// Centralises:
//   - the public error envelope shape (matches docs/08-backend-and-api.md)
//   - zod input parsing with a friendly 400 on failure
//   - normalised provider/AppError → HTTP mapping
//   - X-Request-Id propagation (Phase 7a)

import { ProviderError, toAppError } from '@hamafx/data';
import { AppError, type ErrorCode } from '@hamafx/shared';
import { ZodError, type z } from 'zod';

import { REQUEST_ID_HEADER } from './request-id';

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

export async function parseJsonBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<z.infer<S>> {
  const raw: unknown = await req.json();
  return schema.parse(raw) as z.infer<S>;
}
