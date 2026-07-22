// SPDX-License-Identifier: Apache-2.0

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-drawer';
import { Switch } from '@/components/ui/switch';
import { apiMutate } from '@/lib/api-client';

export function OnboardingResetCard() {
  const router = useRouter();
  const [resetting, setResetting] = useState(false);
  const [fullReset, setFullReset] = useState(false);
  const [confirmEl, confirm] = useConfirm();

  async function handleReset() {
    const ok = await confirm({
      title: 'Reset onboarding?',
      description: 'You will need to go through the wizard again.',
      confirmLabel: 'Reset',
      tone: 'danger',
    });
    if (!ok) return;
    setResetting(true);
    try {
      await apiMutate('/api/admin/onboarding/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: fullReset ? 'full' : 'soft' }),
      });
      toast.success('Onboarding reset. Redirecting...');
      router.push('/onboarding');
    } catch {
      toast.error('Failed to reset onboarding');
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-4 rounded-sm border p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-fg text-sm font-semibold">Onboarding</h3>
        <p className="text-fg-subtle text-sm">Reset and replay the onboarding wizard.</p>
      </div>

      <div className="flex items-center gap-3">
        <Switch checked={fullReset} onCheckedChange={setFullReset} srLabel="Full reset mode" />
        <span className="text-fg text-sm">Full reset (clears API keys and watchlist)</span>
      </div>

      <Button variant="danger" loading={resetting} onClick={handleReset}>
        Reset Onboarding
      </Button>
      {confirmEl}
    </div>
  );
}
