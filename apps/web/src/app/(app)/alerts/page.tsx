import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';

import { AlertList } from './_components/alert-list';

export const metadata: Metadata = { title: 'Alerts' };

export default function AlertsPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Alerts"
        description="One-shot price / indicator / candle-close triggers. Email delivery via Resend."
      />
      <AlertList />
    </div>
  );
}
