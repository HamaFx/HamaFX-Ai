import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { JournalView } from './_components/journal-view';

export const metadata: Metadata = { title: 'Journal' };

export default function JournalPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Journal"
        description="Record trades. Win-rate + R-multiple stats compute on close."
      />
      <JournalView />
    </div>
  );
}
