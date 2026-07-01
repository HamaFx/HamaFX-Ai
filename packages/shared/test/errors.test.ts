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

import { describe, expect, it } from 'vitest';

import {
  AppError,
  validationError,
  unauthorized,
  forbidden,
  notFound,
  rateLimited,
  providerUnavailable,
  budgetExceeded,
  internalError,
  formatErrorResponse,
  ERROR_CODES,
} from '../src';

describe('ERROR_CODES', () => {
  it('contains all expected error codes', () => {
    expect(ERROR_CODES).toEqual([
      'VALIDATION',
      'UNAUTHORIZED',
      'FORBIDDEN',
      'NOT_FOUND',
      'RATE_LIMITED',
      'PROVIDER_UNAVAILABLE',
      'BUDGET_EXCEEDED',
      'INTERNAL',
    ]);
  });

  it('is a readonly tuple', () => {
    expect(ERROR_CODES.length).toBe(8);
  });
});

describe('AppError', () => {
  it('stores code, message, status, and details', () => {
    const err = new AppError('VALIDATION', 'Invalid input', 400, { field: 'symbol' });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AppError');
    expect(err.code).toBe('VALIDATION');
    expect(err.message).toBe('Invalid input');
    expect(err.status).toBe(400);
    expect(err.details).toEqual({ field: 'symbol' });
  });

  it('allows details to be undefined', () => {
    const err = new AppError('NOT_FOUND', 'Not found', 404);
    expect(err.details).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------
describe('validationError', () => {
  it('creates a 400 VALIDATION error', () => {
    const err = validationError('Symbol is required', { symbol: 'XAUUSD' });
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('VALIDATION');
    expect(err.status).toBe(400);
    expect(err.details).toEqual({ symbol: 'XAUUSD' });
  });

  it('works without details', () => {
    const err = validationError('Symbol is required');
    expect(err.status).toBe(400);
    expect(err.details).toBeUndefined();
  });
});

describe('unauthorized', () => {
  it('creates a 401 UNAUTHORIZED error with default message', () => {
    const err = unauthorized();
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.status).toBe(401);
    expect(err.message).toBe('Unauthorized');
    expect(err.details).toBeUndefined();
  });

  it('accepts custom message', () => {
    const err = unauthorized('Invalid API key');
    expect(err.message).toBe('Invalid API key');
  });
});

describe('forbidden', () => {
  it('creates a 403 FORBIDDEN error with default message', () => {
    const err = forbidden();
    expect(err.code).toBe('FORBIDDEN');
    expect(err.status).toBe(403);
    expect(err.message).toBe('Forbidden');
  });

  it('accepts custom message', () => {
    const err = forbidden('Insufficient permissions');
    expect(err.message).toBe('Insufficient permissions');
  });
});

describe('notFound', () => {
  it('creates a 404 NOT_FOUND error with default message', () => {
    const err = notFound();
    expect(err.code).toBe('NOT_FOUND');
    expect(err.status).toBe(404);
  });
});

describe('rateLimited', () => {
  it('creates a 429 RATE_LIMITED error', () => {
    const err = rateLimited();
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.status).toBe(429);
    expect(err.details).toBeUndefined();
  });
});

describe('providerUnavailable', () => {
  it('creates a 503 PROVIDER_UNAVAILABLE error', () => {
    const err = providerUnavailable('BiQuote returned 500', { provider: 'biquote' });
    expect(err.code).toBe('PROVIDER_UNAVAILABLE');
    expect(err.status).toBe(503);
    expect(err.details).toEqual({ provider: 'biquote' });
  });
});

describe('budgetExceeded', () => {
  it('creates a 503 BUDGET_EXCEEDED error with default message', () => {
    const err = budgetExceeded();
    expect(err.code).toBe('BUDGET_EXCEEDED');
    expect(err.status).toBe(503);
    expect(err.message).toBe('Daily AI budget exceeded');
  });
});

describe('internalError', () => {
  it('creates a 500 INTERNAL error', () => {
    const err = internalError('Unexpected error', { cause: 'timeout' });
    expect(err.code).toBe('INTERNAL');
    expect(err.status).toBe(500);
    expect(err.details).toEqual({ cause: 'timeout' });
  });

  it('uses defaults when no args given', () => {
    const err = internalError();
    expect(err.message).toBe('Internal error');
    expect(err.details).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// formatErrorResponse
// ---------------------------------------------------------------------------
describe('formatErrorResponse', () => {
  it('formats AppError as JSON response with matching status', async () => {
    const err = new AppError('VALIDATION', 'Bad request', 400, { field: 'symbol' });
    const res = formatErrorResponse(err);
    expect(res.status).toBe(400);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    const body = await res.json();
    expect(body).toEqual({
      error: { code: 'VALIDATION', message: 'Bad request', details: { field: 'symbol' } },
    });
  });

  it('includes requestId when provided', async () => {
    const err = validationError('Invalid');
    const res = formatErrorResponse(err, { requestId: 'req-123' });
    const body = await res.json();
    expect(body.error.requestId).toBe('req-123');
  });

  it('includes extra headers from options', () => {
    const err = validationError('Invalid');
    const res = formatErrorResponse(err, { headers: { 'X-Custom': 'value' } });
    expect(res.headers.get('X-Custom')).toBe('value');
  });

  it('formats non-AppError as generic 500 INTERNAL', async () => {
    const res = formatErrorResponse(new Error('Something broke'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: { code: 'INTERNAL', message: 'Internal error' } });
  });

  it('formats unknown (non-Error) as generic 500', async () => {
    const res = formatErrorResponse('string error');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: { code: 'INTERNAL', message: 'Internal error' } });
  });

  it('formats AppError without details correctly', async () => {
    const err = unauthorized();
    const res = formatErrorResponse(err);
    const body = await res.json();
    expect(body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
  });
});
