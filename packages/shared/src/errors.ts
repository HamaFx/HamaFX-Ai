// Stable error codes used in the API error envelope (see docs/08-backend-and-api.md).
// Add new codes here, not inline.

export const ERROR_CODES = [
  'VALIDATION',
  'AUTH',
  'NOT_FOUND',
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

export const authError = (message = 'Unauthorized'): AppError =>
  new AppError('AUTH', message, 401);

export const notFound = (message = 'Not found'): AppError =>
  new AppError('NOT_FOUND', message, 404);

export const providerUnavailable = (message: string, details?: unknown): AppError =>
  new AppError('PROVIDER_UNAVAILABLE', message, 503, details);

export const budgetExceeded = (message = 'Daily AI budget exceeded'): AppError =>
  new AppError('BUDGET_EXCEEDED', message, 503);

export const internalError = (message = 'Internal error', details?: unknown): AppError =>
  new AppError('INTERNAL', message, 500, details);
