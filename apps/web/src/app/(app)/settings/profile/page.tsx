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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { revalidatePath } from 'next/cache';

async function updateProfile(_formData: FormData) {
  'use server';
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  // Phase A: name updates are disabled in self-hosted mode.
  // const _name = formData.get('name') as string;
  // const _db = getDb();
  // if (_name && _name !== session.user.name) {
  //   await _db.update(schema.users)
  //     .set({ name: _name })
  //     .where(eq(schema.users.id, session.user.id));
  // }

  revalidatePath('/settings/profile');
}

export default async function ProfileSettingsPage() {
  const session = await auth();
  
  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <div>
        <h2 className="text-lg font-semibold text-fg">Profile</h2>
        <p className="text-sm text-fg-subtle">Manage your public profile and identity.</p>
      </div>

      <form action={updateProfile} className="border border-divider bg-bg-elev-1 rounded-lg p-4 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-fg">Email</label>
          <Input 
            value={session?.user?.email || ''} 
            readOnly 
            disabled 
            className="opacity-50"
          />
          <p className="text-body-sm text-fg-subtle">Your email address cannot be changed right now.</p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-fg">Display Name</label>
          <Input 
            name="name" 
            defaultValue={session?.user?.name || ''} 
            placeholder="Your name"
          />
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit">Save Profile</Button>
        </div>
      </form>
    </div>
  );
}
