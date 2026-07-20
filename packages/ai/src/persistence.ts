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

// P1 — Thin barrel for chat persistence (SRP split).
// Re-exports from focused modules: threads + fork, messages, telemetry.
// Backward-compatible — all consumers keep importing from './persistence'.

export {
  listThreads,
  getThread,
  createThread,
  updateThreadTitle,
  updateThreadPinnedSymbol,
  deleteThread,
  deleteAllThreads,
  forkThread,
  deriveForkedTitle,
  type DbThread,
  type ForkThreadInput,
  type ForkThreadResult,
} from './persistence/thread-persistence';

export {
  listMessages,
  appendUserMessage,
  appendAssistantMessage,
  type DbMessage,
} from './persistence/message-persistence';

export {
  recordTelemetry,
  recordToolTelemetry,
  type TelemetryInput,
  type ToolTelemetryInput,
} from './persistence/telemetry-persistence';

// Re-export so route handlers don't need to import directly from 'ai'.
export type { ModelMessage, UIMessage } from 'ai';
