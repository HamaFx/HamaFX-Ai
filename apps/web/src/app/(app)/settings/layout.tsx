// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { SettingsNav } from './_components/settings-nav';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Manage your account, preferences, and workspace."
      />

      <div className="flex flex-col md:flex-row gap-8">
        <SettingsNav />

        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}
