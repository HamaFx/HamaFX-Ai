// healthchecks.io client. Tiny, dependency-free, fail-closed.
//
// Contract:
//   - `ping(uuid, status, body?)` is fire-and-forget. Network errors are
//     swallowed because a heartbeat that throws would cascade into the
//     code path it was meant to monitor.
//   - When `uuid` is empty/undefined the call is a no-op. This makes
//     local dev / tests work without configuration.
//   - Body is optional; healthchecks.io stores the last 10kB of bodies
//     per check, which is plenty for "what failed" context.
//
// Reference: https://healthchecks.io/docs/

const HC_BASE = 'https://hc-ping.com';
const HC_TIMEOUT_MS = 5_000;

export type PingStatus = 'start' | 'success' | 'fail';

/**
 * Send a single ping. Errors are logged via the optional `onError` callback
 * but never thrown — this is intentional, see comment above.
 */
export async function ping(
  uuid: string | undefined,
  status: PingStatus = 'success',
  body?: string,
  onError?: (err: unknown) => void,
): Promise<void> {
  if (!uuid) return;
  const suffix = status === 'success' ? '' : `/${status}`;
  const url = `${HC_BASE}/${uuid}${suffix}`;
  try {
    await fetch(url, {
      method: body !== undefined ? 'POST' : 'GET',
      ...(body !== undefined ? { body } : {}),
      signal: AbortSignal.timeout(HC_TIMEOUT_MS),
    });
  } catch (err) {
    if (onError) onError(err);
  }
}

/**
 * Wrap an async unit of work with start / success / fail pings. The
 * function is called inside try / catch; on success the body of the
 * `success` ping is the duration in ms. On failure it's the error message.
 */
export async function withHeartbeat<T>(
  uuid: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  await ping(uuid, 'start');
  try {
    const result = await fn();
    await ping(uuid, 'success', String(Date.now() - t0));
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ping(uuid, 'fail', msg.slice(0, 1000));
    throw err;
  }
}
