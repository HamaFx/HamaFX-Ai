// Per-turn tool context — Phase 3 hardening §1.
//
// Tools used to discover their thread + env via module-global setters
// (`setAnalyzeChartImageContext`, `setSummarizeThreadContext`). With a
// warm Lambda serving concurrent requests, request A's context could
// overwrite request B's right before B's tool ran, leading to
// cross-talk between threads. This module replaces the setters with a
// single `AsyncLocalStorage` that propagates context through async
// boundaries automatically — every tool invocation reads the context
// that was active at the time `streamText()` started, not whichever
// happened to be the last writer.

import { AsyncLocalStorage } from 'node:async_hooks';

import type { ServerEnv } from '@hamafx/shared';

/**
 * The slice of env tools may need at runtime. Keep this narrow to keep
 * the per-turn payload small; tools that need extra env should
 * re-resolve from `process.env` rather than expand this shape.
 */
export type ToolEnv = Pick<
  ServerEnv,
  | 'AI_GATEWAY_API_KEY'
  | 'GOOGLE_GENERATIVE_AI_API_KEY'
  | 'GOOGLE_VERTEX_PROJECT'
  | 'GOOGLE_VERTEX_LOCATION'
  | 'GOOGLE_APPLICATION_CREDENTIALS_JSON'
  | 'GOOGLE_APPLICATION_CREDENTIALS'
  | 'AI_DEFAULT_MODEL'
  | 'AI_VISION_MODEL'
  | 'AI_SUMMARY_MODEL'
  | 'AI_EMBEDDING_MODEL'
  | 'MAX_DAILY_USD'
  | 'LOG_PROMPTS'
>;

export interface ToolContext {
  threadId: string;
  env: ToolEnv;
  /**
   * AbortSignal piped through from the chat HTTP request. Long-running
   * tools should check `signal.aborted` between phases so the user
   * closing the tab promptly stops outbound work. Phase 3 hardening §3.
   */
  signal: AbortSignal | null;
  /**
   * Cached daily-budget snapshot. Phase 3 hardening §4 — title /
   * planner / summarize_thread used to each issue their own
   * `dailySpendUsd()` query per turn. Pre-resolving once and caching
   * here saves N round-trips. Components that need a fresher number
   * (e.g. the post-call reconciliation) still hit the DB directly.
   */
  budget: { spent: number; max: number };
}

const store = new AsyncLocalStorage<ToolContext>();

/** Run `fn` with `ctx` accessible from any descendant via `getToolContext()`. */
export function withToolContext<T>(ctx: ToolContext, fn: () => Promise<T>): Promise<T> {
  return store.run(ctx, fn);
}

/**
 * Read the active tool context. Throws if called outside `withToolContext`,
 * which would indicate a tool was invoked from a code path the agent
 * didn't bootstrap (a bug, not a runtime condition).
 */
export function getToolContext(): ToolContext {
  const ctx = store.getStore();
  if (!ctx) {
    throw new Error(
      'getToolContext() called outside withToolContext — tool execution must be bootstrapped by runChat()',
    );
  }
  return ctx;
}

/**
 * Soft variant — returns null instead of throwing when no context is
 * active. Useful for tools that have a sensible degraded mode (e.g.
 * `analyze_chart_image` returning a "no chat context" placeholder).
 */
export function maybeGetToolContext(): ToolContext | null {
  return store.getStore() ?? null;
}
