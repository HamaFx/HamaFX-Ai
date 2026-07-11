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

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { getDb, schema } from '@hamafx/db';
import { createCategorizedLogger } from '@hamafx/shared/logger';

const log = createCategorizedLogger('ai', { component: 'trace-persistence' });

export interface PersistedTrace {
  traceId: string;
  userId: string;
  threadId: string;
  startedAt: number;
  durationMs: number;
  stepCount: number;
  errorCount: number;
  status: 'completed' | 'failed';
  trace: Record<string, unknown>;
}

/**
 * Persist a diagnostic trace to the database and optionally to a file.
 * Never throws — persistence failures are logged but must not affect the
 * chat turn.
 */
export async function persistTrace(trace: PersistedTrace): Promise<void> {
  try {
    await persistToDb(trace);
    await persistToFile(trace);
  } catch (err) {
    log.errorContext(err, 'persistTrace', { traceId: trace.traceId });
  }
}

async function persistToDb(trace: PersistedTrace): Promise<void> {
  try {
    const db = getDb();
    await db.insert(schema.diagnosticTraces).values({
      id: trace.traceId,
      userId: trace.userId,
      threadId: trace.threadId,
      startedAt: new Date(trace.startedAt),
      durationMs: trace.durationMs,
      stepCount: trace.stepCount,
      errorCount: trace.errorCount,
      status: trace.status,
      trace: trace.trace,
    });
  } catch (err) {
    log.errorContext(err, 'persistToDb', { traceId: trace.traceId });
    throw err;
  }
}

async function persistToFile(trace: PersistedTrace): Promise<void> {
  const dir = process.env.DEBUG_TRACE_PATH;
  if (!dir) return;

  try {
    const filePath = path.join(dir, `${trace.traceId}.json`);
    await writeFile(filePath, JSON.stringify(trace.trace, null, 2));
  } catch (err) {
    log.errorContext(err, 'persistToFile', { traceId: trace.traceId });
    throw err;
  }
}
