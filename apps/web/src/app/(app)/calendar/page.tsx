import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { Placeholder } from '@/components/layout/placeholder';

export const metadata: Metadata = { title: 'Calendar' };

export default function CalendarPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Calendar"
        description="Today + 7 days of high/medium/low impact macro events."
      />
      <Placeholder
        phase="Phase 1c"
        title="Calendar not wired up yet"
        description="Trading Economics + FRED ingestion + impact filtering land in Phase 1c."
      />
    </div>
  );
}
