// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';

import { JournalView } from './_components/journal-view';

export const metadata: Metadata = { title: 'Journal | HamaFX' };

export default function JournalPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Journal"
        description="Log, tag, and review your trades with integrated analytics."
      />
      <JournalView />
    </div>
  );
}
