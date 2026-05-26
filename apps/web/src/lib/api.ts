// Tiny helpers shared by all `/api/market/*` route handlers.
// Centralises:
//   - the public error envelope shape (matches docs/08-backend-and-api.md)
//   - zod input parsing with a friendly 400 on failure
//   - normalised provider/AppError → HTTP mapping

import { ProviderError, toAppError } from '@hamafx/data';
import { AppError, type ErrorCode } from '@hamafx/shared';
import { ZodError, type z } from 'zod';

export interface ApiErrorBody {
  error: { code: ErrorCode | 'VALIDATION'; message: string; details?: unknown };
}

/** Standardised error response. */
export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    const body: ApiErrorBody = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    };
    return Response.json(body, { status: err.status });
  }
  if (err instanceof ProviderError) {
    return errorResponse(toAppError(err));
  }
  if (err instanceof ZodError) {
    const body: ApiErrorBody = {
      error: { code: 'VALIDATION', message: 'Invalid request', details: err.flatten() },
    };
    return Response.json(body, { status: 400 });
  }
  console.error('[api] unhandled error', err);
  const body: ApiErrorBody = { error: { code: 'INTERNAL', message: 'Internal error' } };
  return Response.json(body, { status: 500 });
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
