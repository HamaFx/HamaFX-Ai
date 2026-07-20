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

// P0-1 — Utility helpers extracted from agent.ts to reduce file size
// and improve testability.

import { recordToolTelemetry } from '../persistence';

/**
 * Count the number of tool-call parts across a set of model response messages.
 */
export function countToolCalls(messages: readonly { content: unknown }[]): number {
  let n = 0;
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const part of m.content) {
      if (
        part &&
        typeof part === 'object' &&
        'type' in part &&
        (part as { type: string }).type === 'tool-call'
      ) {
        n += 1;
      }
    }
  }
  return n;
}

/**
 * M4: Bulk-insert batched tool telemetry records at onFinish.
 */
export async function flushBatchedTelemetry(
  entries: Array<{ threadId: string | null; userId?: string | null; tool: string; ms: number; ok: boolean; errorCode?: string | null; outputChars?: number | null }>,
): Promise<void> {
  if (entries.length === 0) return;
  await Promise.all(entries.map((e) =>
    recordToolTelemetry({ ...e, messageId: null }).catch(() => {}),
  ));
}
