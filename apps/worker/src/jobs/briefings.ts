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

// Phase 8 PR-10 — `briefings` heavy job, migrated from
// /api/cron/briefings on Vercel (route stays as manual fallback).
//
// On every invocation, scan `economic_events` twice:
//   - pre-event:  events with date ∈ [now+28m, now+32m]  → emitPreEvent
//   - post-event: events with date ∈ [now-32m, now-28m] AND actual IS NOT NULL → emitPostEvent
//
// Each emit is idempotent at the (eventId, kind) primary key on
// briefings_emitted, so the 5-minute systemd cadence (with possible
// drift) is safe to re-run.

import { emitPostEvent, emitPreEvent, findHighImpactEventsInWindow } from '@hamafx/ai';
import { getDb, schema } from '@hamafx/db';

import type { JobContext, JobResult } from './types.js';

const PRE_OFFSET_MS = 30 * 60 * 1000;
const WINDOW_MS = 4 * 60 * 1000;

export async function runBriefings(ctx: JobContext): Promise<JobResult> {
  const now = Date.now();
  const log = ctx.log;

  const db = getDb();
  const users = await db.select({ id: schema.users.id }).from(schema.users);

  // --- Pre-event window: [now+28m, now+32m] ---
  const preCandidates = await findHighImpactEventsInWindow({
    fromMs: now + PRE_OFFSET_MS - WINDOW_MS / 2,
    toMs: now + PRE_OFFSET_MS + WINDOW_MS / 2,
  });

  let preEmitted = 0;
  for (const c of preCandidates) {
    if (ctx.signal?.aborted) {
      log.warn('briefings aborted', { phase: 'pre' });
      break;
    }
    for (const u of users) {
      try {
        const r = await emitPreEvent(u.id, c.id);
        if (r.emitted) preEmitted += 1;
      } catch (err) {
        log.error('emitPreEvent failed', { userId: u.id, eventId: c.id, err: String(err) });
      }
    }
  }

  // --- Post-event window: [now-32m, now-28m] AND actual IS NOT NULL ---
  const postCandidates = await findHighImpactEventsInWindow({
    fromMs: now - PRE_OFFSET_MS - WINDOW_MS / 2,
    toMs: now - PRE_OFFSET_MS + WINDOW_MS / 2,
    requireActual: true,
  });

  let postEmitted = 0;
  for (const c of postCandidates) {
    if (ctx.signal?.aborted) {
      log.warn('briefings aborted', { phase: 'post' });
      break;
    }
    for (const u of users) {
      try {
        const r = await emitPostEvent(u.id, c.id);
        if (r.emitted) postEmitted += 1;
      } catch (err) {
        log.error('emitPostEvent failed', { userId: u.id, eventId: c.id, err: String(err) });
      }
    }
  }

  log.info('briefings complete', {
    preCandidates: preCandidates.length,
    preEmitted,
    postCandidates: postCandidates.length,
    postEmitted,
  });

  return {
    processed: preCandidates.length + postCandidates.length,
    note: `pre=${preEmitted}/${preCandidates.length}, post=${postEmitted}/${postCandidates.length}`,
  };
}
