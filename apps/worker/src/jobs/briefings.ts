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
//   - pre-event:  events with date ∈ [now, now+2h]  → emitPreEvent
//   - post-event: events with date ∈ [now-30d, now-5m] AND actual IS NOT NULL → emitPostEvent
//
// Each emit is idempotent at the (eventId, kind) primary key on
// briefings_emitted, so any cadence (with possible drift) is safe to re-run.
//
// FIX 2026-07-15: Widened both windows from 4-minute slivers to generous
// ranges so briefings aren't permanently missed during worker downtime.
// The `wasEmitted` idempotency guard prevents duplicates.

import { emitPostEvent, emitPreEvent, findHighImpactEventsInWindow } from '@hamafx/ai';
import { getDb, schema } from '@hamafx/db';

import type { JobContext, JobResult } from './types.js';

/** Pre-event: scan high-impact events happening in the next 2 hours. */
const PRE_WINDOW_MS = 2 * 60 * 60 * 1000;
/** Post-event catch-up: scan events that happened in the last 30 days. */
const POST_CATCHUP_MS = 30 * 24 * 60 * 60 * 1000;
/** Small offset to avoid picking up events that literally just fired. */
const POST_GRACE_MS = 5 * 60 * 1000;

export async function runBriefings(ctx: JobContext): Promise<JobResult> {
  const now = Date.now();
  const log = ctx.log;

  const db = getDb();
  const users = await db.select({ id: schema.users.id }).from(schema.users);

  // --- Pre-event window: [now, now+2h] ---
  // Any high-impact event happening in the next 2 hours gets a pre-event
  // briefing. The idempotency check inside emitPreEvent prevents duplicates
  // across consecutive runs.
  const preCandidates = await findHighImpactEventsInWindow({
    fromMs: now,
    toMs: now + PRE_WINDOW_MS,
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

  // --- Post-event catch-up: [now-30d, now-5m] AND actual IS NOT NULL ---
  // Scans the last 30 days for high-impact events with reported actuals
  // that haven't had a post-event briefing emitted yet. This catches up on
  // briefings that were missed during worker downtime.
  const postCandidates = await findHighImpactEventsInWindow({
    fromMs: now - POST_CATCHUP_MS,
    toMs: now - POST_GRACE_MS,
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
