/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Stable error codes used in the API error envelope (see docs/08-backend-and-api.md).
// Add new codes here, not inline.

export const ERROR_CODES = [
  'VALIDATION',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'BUDGET_EXCEEDED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const validationError = (message: string, details?: unknown): AppError =>
  new AppError('VALIDATION', message, 400, details);

export const unauthorized = (message = 'Unauthorized'): AppError =>
  new AppError('UNAUTHORIZED', message, 401);

export const forbidden = (message = 'Forbidden'): AppError =>
  new AppError('FORBIDDEN', message, 403);

export const rateLimited = (message = 'Too Many Requests'): AppError =>
  new AppError('RATE_LIMITED', message, 429);

export const notFound = (message = 'Not found'): AppError =>
  new AppError('NOT_FOUND', message, 404);

export const providerUnavailable = (message: string, details?: unknown): AppError =>
  new AppError('PROVIDER_UNAVAILABLE', message, 503, details);

export const budgetExceeded = (message = 'Daily AI budget exceeded'): AppError =>
  new AppError('BUDGET_EXCEEDED', message, 503);

export const internalError = (message = 'Internal error', details?: unknown): AppError =>
  new AppError('INTERNAL', message, 500, details);

export function formatErrorResponse(
  error: unknown,
  options?: { requestId?: string; headers?: Record<string, string> }
) {
  const baseHeaders = { 'Content-Type': 'application/json', ...(options?.headers || {}) };

  if (error instanceof AppError) {
    return new Response(
      JSON.stringify({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
          ...(options?.requestId ? { requestId: options.requestId } : {}),
        },
      }),
      { status: error.status, headers: baseHeaders },
    );
  }
  
  // Fallback for unhandled errors. Never leak raw error messages to clients.
  return new Response(
    JSON.stringify({
      error: {
        code: 'INTERNAL',
        message: 'Internal error',
        ...(options?.requestId ? { requestId: options.requestId } : {}),
      },
    }),
    { status: 500, headers: baseHeaders },
  );
}
