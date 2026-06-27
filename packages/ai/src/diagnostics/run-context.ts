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

// F5 — Run Diagnostic Context
//
// Provides per-chat-turn diagnostic tracing via Node.js AsyncLocalStorage.
// This is the TypeScript equivalent of Python's ContextVar pattern used
// in DSA's `RunDiagnosticContext`.
//
// Usage:
//   const result = await withDiagnostics(userId, threadId, () => runChat(...));
//   // Inside runChat or any tool:
//   recordStep('fetch_candles', { symbol: 'XAUUSD' });
//   recordStep('fetch_candles', { status: 'completed', durationMs: 42 });
//   recordError(err);
//   const ctx = getDiagnosticContext(); // null if not in a diagnostic scope

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import { redactSecrets } from './redact';

export interface DiagnosticStep {
  /** Step name, e.g. 'fetch_candles', 'run_technical_agent'. */
  name: string;
  /** Lifecycle status of the step. */
  status: 'started' | 'completed' | 'failed';
  /** Duration in milliseconds (set on completion/failure). */
  durationMs?: number;
  /** Auto-redacted metadata for the step. */
  metadata?: Record<string, unknown>;
  /** Timestamp the step was recorded. */
  timestamp: number;
}

export interface DiagnosticError {
  /** Error message (redacted). */
  message: string;
  /** Error name/class. */
  name: string;
  /** Stack trace (redacted), if available. */
  stack?: string;
  /** Timestamp the error was recorded. */
  timestamp: number;
}

export interface RunDiagnosticContext {
  /** Unique trace ID for this run. */
  traceId: string;
  /** User ID owning this chat turn. */
  userId: string;
  /** Thread ID for this chat turn. */
  threadId: string;
  /** Epoch timestamp the run started. */
  startedAt: number;
  /** Ordered list of steps recorded during the run. */
  steps: DiagnosticStep[];
  /** Errors recorded during the run. */
  errors: DiagnosticError[];
}

// AsyncLocalStorage propagates the context through the entire async call
// chain — tools, agents, persistence — without explicit threading.
const diagnosticStore = new AsyncLocalStorage<RunDiagnosticContext>();

/**
 * Wrap an async function in a diagnostic context. All code inside `fn`
 * (including downstream async calls) can use `recordStep`, `recordError`,
 * and `getDiagnosticContext` to add to the trace.
 *
 * The context is automatically cleaned up when `fn` resolves or rejects.
 */
export function withDiagnostics<T>(
  userId: string,
  threadId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const ctx: RunDiagnosticContext = {
    traceId: randomUUID(),
    userId,
    threadId,
    startedAt: Date.now(),
    steps: [],
    errors: [],
  };
  return diagnosticStore.run(ctx, fn);
}

/**
 * Get the current diagnostic context, or null if not inside a
 * `withDiagnostics` scope. Tools and helpers should check for null
 * before recording — diagnostics are optional and must never throw.
 */
export function getDiagnosticContext(): RunDiagnosticContext | null {
  return diagnosticStore.getStore() ?? null;
}

/**
 * Record a step in the current diagnostic context.
 * Metadata is automatically redacted before storage.
 *
 * If no diagnostic context is active, this is a no-op.
 */
export function recordStep(
  name: string,
  metadata?: Record<string, unknown>,
): void {
  const ctx = diagnosticStore.getStore();
  if (!ctx) return;

  const step: DiagnosticStep = {
    name,
    status: 'started',
    timestamp: Date.now(),
  };

  if (metadata !== undefined) {
    step.metadata = redactSecrets(metadata) as Record<string, unknown>;
  }

  ctx.steps.push(step);
}

/**
 * Mark the most recent step with a given name as completed or failed,
 * optionally recording its duration.
 *
 * If no matching step is found, a new step is created with the given status.
 * If no diagnostic context is active, this is a no-op.
 */
export function completeStep(
  name: string,
  status: 'completed' | 'failed',
  durationMs?: number,
  metadata?: Record<string, unknown>,
): void {
  const ctx = diagnosticStore.getStore();
  if (!ctx) return;

  // Find the last 'started' step with this name.
  let lastStartedIdx = -1;
  for (let i = ctx.steps.length - 1; i >= 0; i--) {
    const s = ctx.steps[i]!;
    if (s.name === name && s.status === 'started') {
      lastStartedIdx = i;
      break;
    }
  }

  if (lastStartedIdx >= 0) {
    const step = ctx.steps[lastStartedIdx]!;
    step.status = status;
    if (durationMs !== undefined) step.durationMs = durationMs;
    if (metadata !== undefined) {
      step.metadata = {
        ...(step.metadata ?? {}),
        ...(redactSecrets(metadata) as Record<string, unknown>),
      };
    }
  } else {
    // No matching started step — create a fresh one.
    const step: DiagnosticStep = {
      name,
      status,
      timestamp: Date.now(),
    };
    if (durationMs !== undefined) step.durationMs = durationMs;
    if (metadata !== undefined) {
      step.metadata = redactSecrets(metadata) as Record<string, unknown>;
    }
    ctx.steps.push(step);
  }
}

/**
 * Record an error in the current diagnostic context.
 * The error message and stack trace are automatically redacted.
 *
 * If no diagnostic context is active, this is a no-op.
 */
export function recordError(err: unknown): void {
  const ctx = diagnosticStore.getStore();
  if (!ctx) return;

  const errorObj = err as { message?: unknown; name?: unknown; stack?: unknown };
  const diagnosticError: DiagnosticError = {
    message: redactSecrets(
      typeof errorObj?.message === 'string' ? errorObj.message : String(err),
    ) as string,
    name: typeof errorObj?.name === 'string' ? errorObj.name : 'Error',
    timestamp: Date.now(),
  };

  if (typeof errorObj?.stack === 'string') {
    diagnosticError.stack = redactSecrets(errorObj.stack) as string;
  }

  ctx.errors.push(diagnosticError);
}

/**
 * Serialize the current diagnostic context to a plain object suitable
 * for sending to Sentry, logging, or returning from a diagnostics API.
 * All sensitive data has already been redacted at record time, but we
 * run one final redaction pass for safety.
 *
 * Returns null if no diagnostic context is active.
 */
export function exportDiagnosticContext(): Record<string, unknown> | null {
  const ctx = diagnosticStore.getStore();
  if (!ctx) return null;

  return redactSecrets({
    traceId: ctx.traceId,
    userId: ctx.userId,
    threadId: ctx.threadId,
    startedAt: ctx.startedAt,
    durationMs: Date.now() - ctx.startedAt,
    steps: ctx.steps,
    errors: ctx.errors,
  }) as Record<string, unknown>;
}