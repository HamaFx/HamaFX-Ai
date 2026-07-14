/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ProfileForm } from '../_components/profile-form';

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
