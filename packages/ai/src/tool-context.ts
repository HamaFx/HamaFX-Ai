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

// Per-turn tool context — Phase 3 hardening §1.
//
// Tools used to discover their thread + env via module-global setters
// Phase A: added `userId` for multi-user scoping. All tools that
// write to the DB or call user-scoped services must extract userId
// from this context rather than assuming a single global user.

import { AsyncLocalStorage } from 'node:async_hooks';

import type { ServerEnv } from '@hamafx/shared';

/** The slice of env tools may need at runtime. */
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
  | 'AI_EMBEDDING_MODEL'
  | 'MAX_DAILY_USD'
  | 'LOG_PROMPTS'
>;

import type { UserSettingsRow } from '@hamafx/db/schema';

export interface ToolContext {
  threadId: string;
  /** Phase A — the authenticated user making this request. */
  userId: string;
  env: ToolEnv;
  signal: AbortSignal | null;
  budget: { spent: number; max: number };
  userSettings: UserSettingsRow;
}

const store = new AsyncLocalStorage<ToolContext>();

export function withToolContext<T>(ctx: ToolContext, fn: () => Promise<T>): Promise<T> {
  return store.run(ctx, fn);
}

export function getToolContext(): ToolContext {
  const ctx = store.getStore();
  if (!ctx) {
    throw new Error(
      'getToolContext() called outside withToolContext — tool execution must be bootstrapped by runChat()',
    );
  }
  return ctx;
}

export function maybeGetToolContext(): ToolContext | null {
  return store.getStore() ?? null;
}