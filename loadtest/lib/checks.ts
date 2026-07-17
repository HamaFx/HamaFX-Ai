// Reusable check() helpers for k6 tests.
import { check, type Checkers } from 'k6';
import type { RefinedResponse, ResponseType } from 'k6/http';
import { rateLimited, authFailures } from './metrics';

/**
 * Assert the response has a 200 status and its body is parseable JSON.
 */
export function expectOk(res: RefinedResponse<ResponseType | undefined>): boolean {
  return check(res, {
    'status is 200': (r) => r.status === 200,
    'body is json': (r) => {
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
