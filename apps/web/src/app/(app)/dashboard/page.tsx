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

import { redirect } from 'next/navigation';

import {
  getLatestBriefing,
  listAlerts,
  listEntries,
  listRecentArticles,
  listUpcomingEvents,
} from '@hamafx/ai';

import { auth } from '@/auth';
import { DashboardCanvas } from './_components/dashboard-canvas';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }
  const userId = session.user.id;

  // Phase 1.6 — server-side data fetch for the entire canvas.
  // All widget bodies are pure presentational components; the canvas
  // wires them to these props. Failures on a single source shouldn't
  // break the whole dashboard — each Promise settles independently.
  // Phase 5.6 — track per-source errors so widgets can surface them.
  const settled = await Promise.allSettled([
    listAlerts(userId, { limit: 20 }),
    listUpcomingEvents({ limit: 12 }),
    listEntries(userId, { limit: 50 }),
    listRecentArticles(30),
    getLatestBriefing(userId),
  ]);

  const [alertsR, eventsR, entriesR, newsR, briefingR] = settled;

  // Narrow helpers — never throw on a single failed source.
  const unwrap = <T,>(r: PromiseSettledResult<T>, fallback: T): T =>
    r.status === 'fulfilled' ? r.value : fallback;

  const alerts = unwrap(alertsR, []);
  const events = unwrap(eventsR, []);
  const entries = unwrap(entriesR, []);
  const news = unwrap(newsR, []);
  const briefing = unwrap(briefingR, null);

  // Phase 5.6 — per-source error flags for widget error states.
  // Extract a useful error message from rejected promises (reason
  // may be an Error instance, a string, or an arbitrary value).
  const reasonMsg = (reason: unknown): string =>
    reason instanceof Error ? reason.message : String(reason);

  const fetchErrors = {
    alerts: alertsR.status === 'rejected' ? reasonMsg(alertsR.reason) : null,
    events: eventsR.status === 'rejected' ? reasonMsg(eventsR.reason) : null,
    entries: entriesR.status === 'rejected' ? reasonMsg(entriesR.reason) : null,
    news: newsR.status === 'rejected' ? reasonMsg(newsR.reason) : null,
    briefing: briefingR.status === 'rejected' ? reasonMsg(briefingR.reason) : null,
  };
  const hasAnyError = Object.values(fetchErrors).some(Boolean);

  return (
    <DashboardCanvas
      alerts={alerts}
      events={events}
      entries={entries}
      news={news}
      briefing={briefing}
      fetchErrors={fetchErrors}
      hasAnyError={hasAnyError}
    />
  );
}
