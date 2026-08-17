/**
 * Copyright 2026 Kestrel
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

import { metrics } from '@kestrel/shared';
import { recordToolTelemetry } from '../persistence';
import { maybeGetToolContext, type BatchedToolTelemetry } from '../tool-context';
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
    // Give every invocation its own cancellation controller. The parent
    // signal handles request/turn cancellation; the local controller also
    // aborts the underlying operation when the tool deadline expires.
    const parentSignal = (opts as { abortSignal?: AbortSignal } | undefined)?.abortSignal ?? ctx?.signal ?? undefined;
    const toolController = new AbortController();
    const onParentAbort = () => {
      toolController.abort(parentSignal?.reason);
    };
    if (parentSignal) {
      if (parentSignal.aborted) onParentAbort();
      else parentSignal.addEventListener('abort', onParentAbort, { once: true });
    }
    const opts2 = { ...(opts ?? {}), abortSignal: toolController.signal };
    const timeoutMs = TOOL_TIMEOUT_OVERRIDES[name] ?? DEFAULT_TOOL_TIMEOUT_MS;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let parentAbortListener: (() => void) | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const executePromise = (inner as (i: any, o: any) => Promise<any>)(input, opts2);
      // The tool receives the signal above, but not every implementation
      // observes it. Race the wrapper against parent cancellation as well so
      // a disconnected request cannot remain pending until the tool timeout.
      let rejectParentAbort: ((reason?: unknown) => void) | undefined;
      const parentAbortPromise = parentSignal
        ? new Promise<never>((_, reject) => {
            rejectParentAbort = reject;
          })
        : null;
      parentAbortListener = () => {
        rejectParentAbort?.(parentSignal?.reason ?? new Error(`Tool ${name} aborted`));
      };
      if (parentSignal) {
        parentSignal.addEventListener('abort', parentAbortListener, { once: true });
        if (parentSignal.aborted) parentAbortListener();
      }
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          const timeoutError = new ToolTimeoutError(name, timeoutMs);
          // Reject the wrapper first so a synchronously abort-aware tool
          // cannot replace the stable timeout error with its own error.
          reject(timeoutError);
          toolController.abort(timeoutError);
        }, timeoutMs);
      });
      const races: Array<Promise<unknown>> = [executePromise, timeoutPromise];
      if (parentAbortPromise) races.push(parentAbortPromise);
      const result = await Promise.race(races);
      const ms = Date.now() - startedAt;
      // Phase E metrics — count every successful tool invocation for SLIs.
      metrics.increment('tool_call_total');
      // F7-obs — estimate output size in characters for cost/observability tracking.
      const outputChars = estimateResultChars(result);
      if (timeout) clearTimeout(timeout);
      if (parentSignal) {
        parentSignal.removeEventListener('abort', onParentAbort);
        if (parentAbortListener) parentSignal.removeEventListener('abort', parentAbortListener);
      }
      // M4: Buffer telemetry for batch insert at onFinish instead of
      // individual DB inserts per tool call.
      const entry: BatchedToolTelemetry = {
        threadId: ctx?.threadId ?? null,
        userId: ctx?.userId ?? null,
        tool: name,
        ms,
        ok: true,
        outputChars,
      };
      if (ctx?.toolTelemetryBuffer) {
        ctx.toolTelemetryBuffer.push(entry);
      } else {
        // Fallback: direct insert if no buffer (shouldn't happen).
        void recordToolTelemetry({ ...entry, messageId: null });
      }
      // F5 — Mark the diagnostic step as completed.
      completeStep(`tool:${name}`, 'completed', ms);
      return result;
    } catch (err) {
      const ms = Date.now() - startedAt;
      // Phase E metrics — count every failed tool invocation for SLIs.
      metrics.increment('tool_fail_total');
      if (timeout) clearTimeout(timeout);
      if (parentSignal) {
        parentSignal.removeEventListener('abort', onParentAbort);
        if (parentAbortListener) parentSignal.removeEventListener('abort', parentAbortListener);
      }
      const isTimeout = err instanceof ToolTimeoutError;
      // M4: Buffer telemetry for batch insert.
      const entry: BatchedToolTelemetry = {
        threadId: ctx?.threadId ?? null,
        userId: ctx?.userId ?? null,
        tool: name,
        ms,
        ok: false,
        errorCode: isTimeout ? 'TIMEOUT' : errorCodeFor(err),
      };
      if (ctx?.toolTelemetryBuffer) {
        ctx.toolTelemetryBuffer.push(entry);
      } else {
        void recordToolTelemetry({ ...entry, messageId: null });
      }
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
