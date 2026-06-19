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
