// Reconnect-policy helpers for the BiQuote SignalR hub. We give the
// `@microsoft/signalr` HubConnectionBuilder an array of millisecond delays;
// after exhausting it the hub will surface `onclose` and the consumer
// rebuilds from scratch. The values below climb to 30 s to avoid hammering
// BiQuote during outages.

/**
 * Default reconnect schedule: 0s, 2s, 5s, 10s, 30s.
 *
 * The 0-second first attempt covers the common "connection blipped"
 * scenario where the next packet would land within milliseconds anyway.
 * The 30-second tail keeps us reconnecting indefinitely without burning
 * cycles on the unhappy path.
 */
export const DEFAULT_RECONNECT_DELAYS: number[] = [0, 2_000, 5_000, 10_000, 30_000];

/**
 * Compute a jittered reconnect delay for our manual rebuild loop (used
 * when SignalR's own automatic reconnect gives up). We add ±25 % jitter
 * so multiple workers / restarts don't synchronise their reconnects.
 */
export function jitteredDelay(baseMs: number): number {
  const jitter = baseMs * 0.25;
  return Math.max(100, baseMs + (Math.random() * 2 - 1) * jitter);
}
