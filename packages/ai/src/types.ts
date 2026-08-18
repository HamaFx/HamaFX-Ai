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

// PF-11 — Shared types for the @kestrel/ai package.
//
// Breaking the type-only cycle between agent.ts and tool-context.ts
// (and any future cross-module references) by moving shared types
// here. Modules that need these types import from './types' instead
// of from agent.ts, which eliminates the circular dependency risk.
//
// Rule: anything imported by two or more modules in this package
// should live here.

import type { UIMessage } from 'ai';
import type { AiEnvKeys, ServerEnv } from '@kestrel/shared';

/**
 * PF-11 — moved from agent.ts to break the type cycle.
 *
 * Arguments to the top-level chat turn entrypoint `runChat()`.
 * The route handler constructs this from the HTTP request body
 * and passes it in; we own model selection, prompt assembly,
 * tool wiring, persistence, telemetry, and the daily-budget
 * guardrail in one place so route code stays a thin HTTP shell.
 */
export interface RunChatArgs {
  threadId: string;
  /** Phase A — the authenticated user owning this chat turn. */
  userId: string;
  /** Most recent user UIMessage to append + answer. */
  userMessage: UIMessage;
  /** Whole env — caller passes the already-validated ServerEnv env subset. */
  env: Pick<ServerEnv, AiEnvKeys>;
  /** Optional model override (e.g. coming from thread.modelOverride). */
  modelOverride?: string | null;
  /** Custom instructions to append to the system prompt. */
  customInstructions?: string;
  /** Aborts streaming + tool calls when the client disconnects. */
  signal?: AbortSignal;
  /** HTTP request id used to correlate route logs with the AI trace. */
  requestId?: string;
  /**
   * Background comparison mode. It runs the normal agent pipeline without
   * appending chat messages or generating an automatic title.
   */
  persistMessages?: boolean;
  /** Durable telemetry label for a background legacy comparison run. */
  telemetryKind?: 'legacy_shadow';
  /** Optional idempotency keys omitted from the authenticated history snapshot. */
  excludeMessageIdempotencyKeys?: readonly string[];
}
