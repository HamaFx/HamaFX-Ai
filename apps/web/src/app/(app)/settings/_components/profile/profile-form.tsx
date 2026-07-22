'use client';

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

import { useActionState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updateProfileAction } from '../../actions';
import { toast } from 'sonner';

interface ProfileFormProps {
  initialName: string;
  email: string;
}

export function ProfileForm({ initialName, email }: ProfileFormProps) {
  const [state, action, pending] = useActionState(async (prevState: { error: string; ok: boolean }, formData: FormData) => {
    const res = await updateProfileAction(formData);
    return {
      error: 'error' in res ? (res.error ?? '') : '',
      ok: res.ok,
    };
  }, { error: '', ok: false });

  useEffect(() => {
    if (state.ok) {
      toast.success('Profile updated successfully');
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state.ok, state.error]);

  return (
    <form action={action} className="border border-border bg-bg-elev-1 rounded-sm p-4 flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="settings-email" className="text-sm font-medium text-fg">Email</label>
        <Input 
          id="settings-email"
          value={email} 
          readOnly 
          disabled 
          className="opacity-50"
        />
        <p className="text-body-sm text-fg-subtle">Your email address cannot be changed right now.</p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="display-name" className="text-sm font-medium text-fg">Display Name</label>
        <Input 
          id="display-name"
          name="name" 
          defaultValue={initialName} 
          placeholder="Your name"
          required
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" loading={pending}>Save Profile</Button>
      </div>
    </form>
  );
}
