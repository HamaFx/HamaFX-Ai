// SPDX-License-Identifier: Apache-2.0

import { redirect } from 'next/navigation';

import { checkIsAdmin } from '@/lib/admin-check';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) {
    redirect('/chat');
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-fg text-2xl font-bold tracking-tight">Admin</h1>
        <p className="text-fg-subtle text-sm">Debug tools, system health, and user management.</p>
      </header>
      {children}
    </div>
  );
}
