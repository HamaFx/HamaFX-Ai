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

// Sign-out trigger. Drawer-confirm because losing the session on a personal
// app is annoying if it happens by accident.

import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-drawer';
import { withCsrf } from '@/lib/csrf';

export function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [confirmEl, confirm] = useConfirm();
  const router = useRouter();
  const queryClient = useQueryClient();

  async function logout() {
    const ok = await confirm({
      title: 'Sign out?',
      description: 'You will need the app password to sign back in on this device.',
      confirmLabel: 'Sign out',
      tone: 'danger',
    });
    if (!ok) return;
    setPending(true);
    try {
      const res = await fetch('/api/auth/signout', { method: 'POST', ...withCsrf() });
      if (!res.ok) {
        toast.error('Failed to log out. Please try again.');
        setPending(false);
        return;
      }
      queryClient.clear();
      router.push('/login');
      router.refresh();
    } catch {
      toast.error('Failed to log out. Please check your network connection.');
      setPending(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => void logout()}
        loading={pending}
      >
        <LogOut className="size-3.5" />
        {pending ? 'Signing out…' : 'Sign out'}
      </Button>
      {confirmEl}
    </>
  );
}
