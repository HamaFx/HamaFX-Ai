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

/**
 * Fallback policy for the agent — when a model override fails,
 * decide whether to retry with the default domain model.
 *
 * Phase B — UX_UPGRADE_PLAN.md item 15.
 *
 * The classifier is intentionally narrow. We DO NOT retry on:
 *   - 4xx other than 401/403/429 — bad request shapes won't be
 *     fixed by switching models.
 *   - Network timeouts after partial output — partial state is
 *     already on the wire; rolling back would be confusing.
 *
 * We DO retry on:
 *   - 401 / 403 — likely a key-permission problem with the
 *     override's provider.
 *   - 429 — rate-limit on the override's provider. The default
 *     provider might have spare capacity.
 *   - 5xx — transient upstream failure.
 *
 * The classifier only sees the error object. The agent wraps the
 * actual streamText call in a try/catch, captures the rejection,
 * and decides whether to fall back.
 */

/** Regex for context-window overflow error messages across providers. */
const CTX_OVERFLOW_RX = /context\s*(length|window|limit|size)|maximum\s*context|reduce\s*the\s*length|too\s*many\s*tokens|max[_-]?tokens|input\s*is\s*too\s*(long|large)|exceeds\s*(the\s*)?(context|limit|maximum)/;

export type FallbackReason =
  | 'auth' // 401 / 403
  | 'rate-limit' // 429
  | 'upstream' // 5xx
  | 'context-overflow' // context window exceeded (400 — retry with larger-model provider)
  | 'timeout' // network timeout
  | 'unknown'; // anything else

export interface FallbackDecision {
  fallback: boolean;
  reason: FallbackReason;
  /** Short user-facing reason string for the data-fallback part. */
  message: string;
}

/**
 * Inspect an error thrown during model resolution or streaming and
 * produce a fallback decision. Pure function — no I/O, safe to call
 * from anywhere.
 *
 * Heuristics: we look at statusCode, HTTP status text, and the
 * provider SDK's typical error messages. We also accept the AI
 * SDK's `APICallError` and `AI_APICallError` shape, but the
 * classifier only relies on duck-typed fields.
 */
export function classifyStreamError(err: unknown): FallbackDecision {
  const statusCode = getStatusCode(err);
  const message = err instanceof Error ? err.message : String(err);
  const lowerMessage = message.toLowerCase();

  if (statusCode === 401 || statusCode === 403 || /unauthor|forbidden|invalid\s*api\s*key|incorrect\s*api\s*key/.test(lowerMessage)) {
    return { fallback: true, reason: 'auth', message: 'Override provider rejected the API key' };
  }
  if (statusCode === 429 || /rate\s*limit|too\s*many\s*requests|quota/.test(lowerMessage)) {
    return { fallback: true, reason: 'rate-limit', message: 'Override provider rate-limited the request' };
  }
  if (statusCode !== null && statusCode >= 500 && statusCode < 600) {
    return { fallback: true, reason: 'upstream', message: `Override provider returned HTTP ${statusCode}` };
  }
  // F15 — context-window errors. Providers return these when the message
  // history exceeds their context limit. Common response codes: 400 (Bad Request),
  // 413 (Payload Too Large). Also checked when no status code is present
  // (e.g. errors wrapped by SDKs or proxies). Falling back to a different
  // provider (e.g. Claude 200K → Gemini 1M) is the correct remediation.
  if ((statusCode === 400 || statusCode === 413 || statusCode === null) && CTX_OVERFLOW_RX.test(lowerMessage)) {
    return { fallback: true, reason: 'context-overflow', message: 'Context window exceeded — trying a larger-model provider' };
  }
  if (/timeout|timed?\s*out|aborted|network|fetch\s*failed/.test(lowerMessage)) {
    return { fallback: true, reason: 'timeout', message: 'Override provider timed out' };
  }
  return { fallback: false, reason: 'unknown', message };
}

/**
 * Convenience wrapper — returns the boolean only.
 */
export function shouldFallback(err: unknown): boolean {
  return classifyStreamError(err).fallback;
}

/**
 * Build the payload of a `data-fallback` UIMessage part. The shape
 * matches what ChatScreen / message.tsx already renders for
 * `data-citation-warning` parts: typed fields, no React.
 *
 * Caller is responsible for appending this to `parts` so it shows
 * up in the rendered message and is persisted with the rest of
 * the assistant turn.
 */
export interface FallbackPartPayload {
  type: 'data-fallback';
  reason: FallbackReason;
  /** Override model id that failed (so the user knows what to fix). */
  override: string;
  /** Human-readable explanation. */
  message: string;
}

export function makeFallbackPart(
  override: string,
  decision: FallbackDecision,
): FallbackPartPayload {
  return {
    type: 'data-fallback',
    reason: decision.reason,
    override,
    message: decision.message,
  };
}

/**
 * Duck-typed status-code extractor. Many SDKs stash the HTTP
 * status on `err.statusCode` or `err.status`. We check a few
 * common locations before falling back to scanning the message.
 */
function getStatusCode(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null;
  const e = err as Record<string, unknown>;
  for (const key of ['statusCode', 'status', 'httpStatus', 'code']) {
    const v = e[key];
    if (typeof v === 'number' && v >= 100 && v < 600) return v;
  }
  // The AI SDK's APICallError exposes `response.status`.
  const response = e.response;
  if (response && typeof response === 'object') {
    const r = response as Record<string, unknown>;
    if (typeof r.status === 'number' && r.status >= 100 && r.status < 600) {
      return r.status;
    }
  }
  return null;
}
