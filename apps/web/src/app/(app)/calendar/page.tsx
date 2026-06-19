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

// /calendar — server-rendered list of upcoming/recent macro events.
// The page itself is a thin wrapper: fetch + render the
// <CalendarHero/> at the top and the interactive <CalendarView/> below.

import { listUpcomingEvents } from '@hamafx/ai';
import { CalendarDays } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';

import { CalendarHero } from './_components/calendar-hero';
import { CalendarView } from './_components/calendar-view';
import { RefreshButton } from '../news/_components/refresh-button';

export const metadata: Metadata = { title: 'Calendar' };
export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const events = await listUpcomingEvents();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Calendar"
        description="Upcoming macro events that move XAU / EUR / GBP / USD."
      />

      {events.length === 0 ? (
        <EmptyState
          tone="muted"
          icon={<CalendarDays className="size-7" strokeWidth={1.75} />}
          title="No events scheduled"
          description="Events refresh automatically every 15 minutes. Tap below to refresh now."
          action={<RefreshButton endpoint="/api/cron/calendar" />}
        />
      ) : (
        <>
          <CalendarHero events={events} />
          <CalendarView initialEvents={events} />
        </>
      )}
    </div>
  );
}
