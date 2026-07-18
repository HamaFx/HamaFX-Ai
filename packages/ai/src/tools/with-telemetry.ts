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

// Phase 3 hardening §2 — central tool wrapper.
//
// Per-tool telemetry used to live inside `agent.ts.onStepFinish` by
// inspecting the AI SDK's content parts. That worked but it (a)
// duplicated the parts-walking logic from delivery / verification, (b)
// captured `errorCode` only when the SDK happened to surface an error
// part, and (c) had no place to enforce the per-turn `signal` from
// Phase 3 §3.
//
// `withTelemetry(name, tool)` wraps a tool's `execute` so every
// invocation:
//
//   1. Reads the active `ToolContext` (Phase 3 §1) for `threadId` +
//      `signal`.
//   2. Pipes the AbortSignal through to the tool's `execute(input,
//      opts)` so long-running tools can short-circuit when the chat
//      tab closes.
//   3. Records exactly one row in `chat_tool_telemetry` per
//      invocation, with `ms`, `ok`, and a normalised `errorCode` on
//      failure.
//
// F7 — per-tool timeout enforcement. Each tool has a configurable deadline
// (default 25s). If the tool doesn't complete within the deadline, it's
// aborted via the AbortSignal. This prevents a hung tool from consuming
// the entire turn budget. The deadline can be overridden per-tool via
// TOOL_TIMEOUT_OVERRIDES.
//
// Tools that already surface their own telemetry (none today) can opt
// out by importing the raw factory and skipping the wrap.

import type { Tool } from 'ai';

import { recordToolTelemetry } from '../persistence';
import { maybeGetToolContext } from '../tool-context';
import { recordStep, completeStep, recordError } from '../diagnostics';

/** Custom error class for tool timeout detection. */
class ToolTimeoutError extends Error {
  readonly code = 'TIMEOUT';
  constructor(toolName: string, ms: number) {
    super(`Tool ${toolName} timed out after ${ms}ms`);
    this.name = 'ToolTimeoutError';
  }
}

/** Default per-tool timeout in milliseconds. */
const DEFAULT_TOOL_TIMEOUT_MS = 25_000;

/** Per-tool timeout overrides for especially slow or fast tools (ms). */
const TOOL_TIMEOUT_OVERRIDES: Record<string, number> = {
  // Vision model analysis can take longer.
  analyze_chart_image: 45_000,
  // Committee runs 4 LLM calls — needs extra headroom.
  convene_committee: 60_000,
  // Historical backtests can be slow.
  replay_setup: 40_000,
  // Fast tools can be stricter.
  get_price: 5_000,
  get_candles: 10_000,
  get_indicators: 10_000,
};

/**
 * Wrap a tool with execute-side telemetry + signal propagation. The
 * underlying tool definition is otherwise unchanged.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withTelemetry<T extends Tool<any, any>>(name: string, t: T): T {
  const inner = (t as { execute?: unknown }).execute;
  if (typeof inner !== 'function') {
    // No execute means no work to wrap (e.g. a tool that only declares
    // its schema and lets the SDK pass the args back to the model).
    return t;
  }

  // Type-erased wrapping: the AI SDK's `Tool` generics are wide enough
  // that pinning them per-call breaks call sites. We instead trust the
  // inner signature and forward args through.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrappedExecute = async (input: any, opts: any) => {
    const ctx = maybeGetToolContext();
    const startedAt = Date.now();
    // F5 — Record diagnostic step for this tool call.
    recordStep(`tool:${name}`, { input });
    // Propagate the per-turn AbortSignal so the tool's `opts.abortSignal`
    // (the AI SDK's own field) is set when the user has closed the tab.
    // Tools may read `opts.abortSignal?.aborted` between phases.
    const opts2 = ctx?.signal
      ? { ...(opts ?? {}), abortSignal: ctx.signal }
      : opts;
    // F7 — per-tool timeout: race the tool execution against a deadline.
    // If the deadline fires first, the tool's result is discarded.
    const timeoutMs = TOOL_TIMEOUT_OVERRIDES[name] ?? DEFAULT_TOOL_TIMEOUT_MS;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    // If ctx.signal aborts (tab close), cancel the timeout to avoid spurious errors.
    if (ctx?.signal && !ctx.signal.aborted) {
      ctx.signal.addEventListener('abort', () => { if (timeout) clearTimeout(timeout); }, { once: true });
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const executePromise = (inner as (i: any, o: any) => Promise<any>)(input, opts2);
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new ToolTimeoutError(name, timeoutMs)), timeoutMs);
      });
      const result = await Promise.race([executePromise, timeoutPromise]);
      const ms = Date.now() - startedAt;
      // F7-obs — estimate output size in characters for cost/observability tracking.
      const outputChars = estimateResultChars(result);
      if (timeout) clearTimeout(timeout);
      void recordToolTelemetry({
        threadId: ctx?.threadId ?? null,
        userId: ctx?.userId ?? null,
        messageId: null,
        tool: name,
        ms,
        ok: true,
        outputChars,
      });
      // F5 — Mark the diagnostic step as completed.
      completeStep(`tool:${name}`, 'completed', ms);
      return result;
    } catch (err) {
      const ms = Date.now() - startedAt;
      if (timeout) clearTimeout(timeout);
      const isTimeout = err instanceof ToolTimeoutError;
      void recordToolTelemetry({
        threadId: ctx?.threadId ?? null,
        userId: ctx?.userId ?? null,
        messageId: null,
        tool: name,
        ms,
        ok: false,
        errorCode: isTimeout ? 'TIMEOUT' : errorCodeFor(err),
      });
      // F5 — Record the error and mark the step as failed.
      recordError(err);
      completeStep(`tool:${name}`, 'failed', ms);
      throw err;
    }
  };

  return {
    ...t,
    execute: wrappedExecute,
  } as T;
}

/**
 * F7-obs — estimate character count of a tool's result for telemetry.
 * Handles strings, objects (JSON length), and buffers.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function estimateResultChars(result: any): number | null {
  if (result === null || result === undefined) return 0;
  if (typeof result === 'string') return result.length;
  if (typeof result === 'object') {
    try {
      return JSON.stringify(result).length;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Best-effort error-code extraction. We prefer:
 *   1. A `code` field on the error (custom errors).
 *   2. The error's `name` (built-in TypeError, RangeError, AbortError…).
 *   3. The literal string "unknown" when neither is set.
 *
 * Stable across error-class inheritance because we don't rely on
 * `instanceof` — works for cross-realm errors that might be re-wrapped.
 */
function errorCodeFor(err: unknown): string {
  if (err && typeof err === 'object') {
    const obj = err as { code?: unknown; name?: unknown };
    if (typeof obj.code === 'string' && obj.code.length > 0) return obj.code;
    if (typeof obj.name === 'string' && obj.name.length > 0) return obj.name;
  }
  return 'unknown';
}
