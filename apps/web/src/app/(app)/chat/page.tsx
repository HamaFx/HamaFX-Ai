import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { Placeholder } from '@/components/layout/placeholder';

export const metadata: Metadata = { title: 'Chat' };

export default function ChatHomePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Chat" description="Talk to your trading copilot." />
      <Placeholder
        phase="Phase 1b"
        title="Chat is not wired up yet"
        description="The agent, tools, and streaming UI land in Phase 1b — see docs/10-roadmap.md. For now this route exists so the app shell is reachable end-to-end after sign-in."
      />
    </div>
  );
}
