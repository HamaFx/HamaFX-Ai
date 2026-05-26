import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeader } from '@/components/layout/page-header';

import { LogoutButton } from './_components/logout-button';
import { TestEmailButton } from './_components/test-email-button';

export const metadata: Metadata = { title: 'Settings' };

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Theme, model defaults, indicator defaults." />

      <section className="border-border bg-bg-elev-1 flex flex-col divide-y divide-[var(--color-border)] rounded-lg border">
        <Row href="/settings/usage" label="Usage" hint="Token spend, last 30 days" />
      </section>

      <section className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-fg-muted text-sm font-medium">Notifications</h2>
        <p className="text-fg-subtle text-xs">
          Send a one-off test email through Resend to confirm the alerts pipeline is wired up.
        </p>
        <TestEmailButton />
      </section>

      <section className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-fg-muted text-sm font-medium">Session</h2>
        <LogoutButton />
      </section>
    </div>
  );
}

function Row({ href, label, hint }: { href: string; label: string; hint?: string }) {
  return (
    <Link
      href={href}
      className="hover:bg-bg-elev-2 flex items-center justify-between gap-4 px-4 py-3 transition-colors"
    >
      <div className="flex flex-col">
        <span className="text-fg text-sm font-medium">{label}</span>
        {hint ? <span className="text-fg-subtle text-xs">{hint}</span> : null}
      </div>
      <span aria-hidden="true" className="text-fg-subtle">
        ›
      </span>
    </Link>
  );
}
