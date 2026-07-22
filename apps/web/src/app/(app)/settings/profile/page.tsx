// SPDX-License-Identifier: Apache-2.0

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ProfileForm } from '../_components/profile/profile-form';

export const dynamic = 'force-dynamic';

export default async function ProfileSettingsPage() {
  const session = await auth();
  if (!session) redirect('/login');

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex flex-col gap-1">
        <h2 className="text-fg text-lg font-semibold tracking-tight">Profile</h2>
        <p className="text-fg-subtle text-sm">Manage your public profile and identity.</p>
      </div>

      <ProfileForm
        initialName={session?.user?.name || ''}
        email={session?.user?.email || ''}
      />
    </div>
  );
}
