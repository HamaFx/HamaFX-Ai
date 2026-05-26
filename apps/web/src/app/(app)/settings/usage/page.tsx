import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { Placeholder } from '@/components/layout/placeholder';

export const metadata: Metadata = { title: 'Usage' };

export default function UsagePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Usage"
        description="AI cost and token spend over the last 30 days."
      />
      <Placeholder
        phase="Phase 1b"
        title="Usage view not wired up yet"
        description="Reads from the chat_telemetry table once the chat turn pipeline is recording rows in Phase 1b."
      />
    </div>
  );
}
