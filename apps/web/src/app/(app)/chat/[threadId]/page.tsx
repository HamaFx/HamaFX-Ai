import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { Placeholder } from '@/components/layout/placeholder';

export const metadata: Metadata = { title: 'Chat thread' };

interface PageProps {
  params: Promise<{ threadId: string }>;
}

export default async function ChatThreadPage({ params }: PageProps) {
  const { threadId } = await params;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Thread" description={`Thread id: ${threadId}`} />
      <Placeholder
        phase="Phase 1b"
        title="Thread not wired up yet"
        description="Per-thread chat surface lands with the agent in Phase 1b."
      />
    </div>
  );
}
