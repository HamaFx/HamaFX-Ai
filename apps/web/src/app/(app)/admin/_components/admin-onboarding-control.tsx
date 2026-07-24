// SPDX-License-Identifier: Apache-2.0

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-drawer';
import { Switch } from '@/components/ui/switch';
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { apiFetch, apiMutate } from '@/lib/api-client';
import { toastApiError } from '@/lib/toast-api-error';
import type { OnboardingInspectDTO } from '@/lib/services/admin-dtos';

export function AdminOnboardingControl() {
  const router = useRouter();
  const [targetUserId, setTargetUserId] = useState('');
  const [status, setStatus] = useState<OnboardingInspectDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [fullReset, setFullReset] = useState(false);
  const [confirmEl, confirm] = useConfirm();

  const fetchStatus = useCallback(async (userId: string) => {
    setLoading(true);
    try {
      const data = await apiFetch<OnboardingInspectDTO>(
        `/api/admin/onboarding/inspect?userId=${encodeURIComponent(userId)}`,
      );
      setStatus(data);
    } catch (err) {
      toastApiError(err, 'Failed to load onboarding status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus('');
  }, [fetchStatus]);

  async function handleLoadUser(e: React.FormEvent) {
    e.preventDefault();
    const userId = targetUserId.trim();
    await fetchStatus(userId);
  }

  async function handleReset() {
    if (!status) return;
    const ok = await confirm({
      title: 'Reset onboarding?',
      description: `This will reset onboarding for user ${status.userId}.`,
      confirmLabel: 'Reset',
      tone: 'danger',
    });
    if (!ok) return;
    setResetting(true);
    try {
      await apiMutate('/api/admin/onboarding/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: status.userId, mode: fullReset ? 'full' : 'soft' }),
      });
      toast.success('Onboarding reset. Redirecting...');
      router.push('/onboarding');
    } catch (err) {
      toastApiError(err, 'Failed to reset onboarding');
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection title="Onboarding Inspector" description="Inspect and reset onboarding for any user.">
        <form onSubmit={handleLoadUser} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="target-user-id" className="text-sm font-medium">
              Target user ID
            </label>
            <Input
              id="target-user-id"
              type="text"
              placeholder="Leave blank for your own account"
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary" loading={loading}>
            Load user
          </Button>
        </form>

        {status && (
          <div className="border-border bg-bg-elev-1 flex flex-col gap-4 rounded-sm border p-4">
            <div className="flex flex-col gap-1">
              <span className="text-fg text-sm font-semibold">User ID</span>
              <span className="text-fg-subtle text-sm font-mono break-all">{status.userId}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-fg text-sm font-semibold">Status</span>
              <Badge tone={status.onboardingCompleted ? 'success' : 'warn'}>
                {status.onboardingCompleted ? 'Completed' : 'Not completed'}
              </Badge>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-fg text-sm font-semibold">Language</span>
              <span className="text-fg-subtle text-sm">{status.userSettings.language ?? '—'}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-fg text-sm font-semibold">Default symbol</span>
              <span className="text-fg-subtle text-sm">{status.userSettings.defaultSymbol ?? '—'}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-fg text-sm font-semibold">Timezone</span>
              <span className="text-fg-subtle text-sm">{status.userSettings.timezone ?? '—'}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-fg text-sm font-semibold">Watchlist</span>
              <span className="text-fg-subtle text-sm">
                {status.watchlist.length > 0 ? status.watchlist.join(', ') : '—'}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-fg text-sm font-semibold">BYOK API keys</span>
              <span className="text-fg-subtle text-sm">
                {status.hasApiKeys ? status.apiProviders.join(', ') : 'None configured'}
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
        )}
      </SettingsSection>
      {confirmEl}
    </div>
  );
}
