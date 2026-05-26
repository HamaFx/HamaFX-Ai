import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { Placeholder } from '@/components/layout/placeholder';

export const metadata: Metadata = { title: 'Journal' };

export default function JournalPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Journal" description="Trade entries, R-multiples, win-rate." />
      <Placeholder
        phase="Phase 1d"
        title="Journal not wired up yet"
        description="Manual entries land in Phase 1d; auto-fill from chat and the agent-authored weekly review come in Phase 2."
      />
    </div>
  );
}
