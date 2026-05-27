'use client';

// Sign-out trigger. Drawer-confirm because losing the session on a personal
// app is annoying if it happens by accident.

import { LogOut } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-drawer';

export function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [confirmEl, confirm] = useConfirm();

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
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.assign('/login');
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
