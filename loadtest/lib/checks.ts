// Reusable check() helpers for k6 tests.
import { check, type Checkers } from 'k6';
import type { RefinedResponse, ResponseType } from 'k6/http';
import { rateLimited, authFailures } from './metrics.js';

/**
 * Assert the response has a 2xx status and its body is parseable JSON.
 * Accepts 200, 201 (Created), and 204 (No Content) — the three most
 * common success codes across GET, POST, PUT, PATCH, and DELETE.
 */
export function expectOk(res: RefinedResponse<ResponseType | undefined>): boolean {
  return check(res, {
    'status is 2xx': (r) => r.status >= 200 && r.status < 300,
    'body is json': (r) => {
      // 204 No Content has no body — skip JSON parse check.
      if (r.status === 204) return true;
      try {
        JSON.parse(r.body as string);
        return true;
      } catch {
        return false;
      }
    },
  }) as unknown as boolean;
}

/**
 * Assert the response status is in the given list.
 */
export function expectStatus(
  res: RefinedResponse<ResponseType | undefined>,
  codes: number[],
  extraChecks?: Checkers<RefinedResponse<ResponseType | undefined>>,
): boolean {
  return check(res, {
    [`status in [${codes.join(',')}]`]: (r) => codes.includes(r.status),
    ...(extraChecks ?? {}),
  }) as unknown as boolean;
}

/**
 * Record a 429 response in the rate_limited metric and return whether
 * it was indeed a 429.
 */
export function record429(res: RefinedResponse<ResponseType | undefined>): boolean {
  const is429 = res.status === 429;
  rateLimited.add(is429 ? 1 : 0);
  return is429;
}

/**
 * Record authentication failures (401/403) in the auth_failures counter.
 */
export function recordAuthFailure(res: RefinedResponse<ResponseType | undefined>): boolean {
  const isAuthFail = res.status === 401 || res.status === 403;
  if (isAuthFail) authFailures.add(1);
  return isAuthFail;
}
