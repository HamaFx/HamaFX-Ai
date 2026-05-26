import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { Placeholder } from '@/components/layout/placeholder';

export const metadata: Metadata = { title: 'Alerts' };

export default function AlertsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Alerts" description="Price / indicator / candle-close triggers." />
      <Placeholder
        phase="Phase 1d"
        title="Alerts not wired up yet"
        description="Alert rules + the Vercel-Cron evaluator + email delivery land in Phase 1d."
      />
    </div>
  );
}
