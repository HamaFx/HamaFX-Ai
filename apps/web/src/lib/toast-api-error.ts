// SPDX-License-Identifier: Apache-2.0

import { toast } from 'sonner';

import { ApiError } from './api-client';

/**
 * Show a toast that consistently surfaces the `x-request-id` header when
 * the error is an `ApiError`. This makes every admin tab traceable to a
 * single server log line — the Cron table already does this; this helper
 * makes it trivial for the other tabs to follow suit.
 *
 * Usage:
 *   } catch (err) {
 *     toastApiError(err, 'Failed to load cron history');
 *   }
 */
export function toastApiError(err: unknown, fallback: string): void {
  const msg = err instanceof Error ? err.message : fallback;
  if (err instanceof ApiError && err.requestId) {
    toast.error(msg, { description: `Ref: ${err.requestId}` });
  } else {
    toast.error(msg);
  }
}
