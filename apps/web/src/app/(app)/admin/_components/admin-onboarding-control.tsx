// SPDX-License-Identifier: Apache-2.0

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-drawer';
import { Switch } from '@/components/ui/switch';
import { SkeletonCard } from '@/components/ui/skeleton';
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { apiFetch, apiMutate } from '@/lib/api-client';

interface OnboardingStatus {
  userId: string;
  onboardingCompleted: boolean;
  onboardingProgress: Record<string, unknown> | null;
  defaultSymbol: string | null;
  timezone: string | null;
  watchlist: string[];
}

export function AdminOnboardingControl() {
  const router = useRouter();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [fullReset, setFullReset] = useState(false);
  const [confirmEl, confirm] = useConfirm();

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<OnboardingStatus>('/api/admin/onboarding/status');
      setStatus(data);
    } catch {
      toast.error('Failed to load onboarding status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  async function handleReset() {
    const ok = await confirm({
      title: 'Reset onboarding?',
      description: 'This will require going through the wizard again.',
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

  if (loading || !status) {
    return <SkeletonCard lines={4} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection title="Onboarding Control" description="Reset and replay the onboarding wizard.">
        <div className="border-border bg-bg-elev-1 flex flex-col gap-4 rounded-sm border p-4">
          <div className="flex flex-col gap-1">
            <span className="text-fg text-sm font-semibold">Status</span>
            <span className="text-fg-subtle text-sm">
              {status.onboardingCompleted ? 'Completed' : 'Not completed'}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-fg text-sm font-semibold">Default symbol</span>
            <span className="text-fg-subtle text-sm">{status.defaultSymbol ?? '—'}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-fg text-sm font-semibold">Timezone</span>
            <span className="text-fg-subtle text-sm">{status.timezone ?? '—'}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-fg text-sm font-semibold">Watchlist</span>
            <span className="text-fg-subtle text-sm">
              {status.watchlist.length > 0 ? status.watchlist.join(', ') : '—'}
            </span>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Switch
              checked={fullReset}
              onCheckedChange={setFullReset}
              srLabel="Full reset mode"
            />
            <span className="text-fg text-sm">Full reset (clears API keys and watchlist)</span>
          </div>

          <Button variant="danger" loading={resetting} onClick={handleReset}>
            Reset Onboarding
          </Button>
        </div>
      </SettingsSection>
      {confirmEl}
    </div>
  );
}
