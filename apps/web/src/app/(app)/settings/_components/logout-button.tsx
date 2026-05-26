'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';

export function LogoutButton() {
  const [pending, setPending] = useState(false);
  async function logout(): Promise<void> {
    setPending(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.assign('/login');
    }
  }
  return (
    <Button variant="secondary" onClick={logout} loading={pending}>
      {pending ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
