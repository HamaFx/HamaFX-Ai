// SPDX-License-Identifier: Apache-2.0

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-drawer';
import { SkeletonCard } from '@/components/ui/skeleton';
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { apiFetch, apiMutate } from '@/lib/api-client';
import { toastApiError } from '@/lib/toast-api-error';
import { cn } from '@/lib/cn';

interface ProbeResponse {
  enabled: boolean;
}

interface FlushResult {
  target: string;
  status: 'flushed' | 'unsupported';
  reason?: string;
  affected?: number;
}

interface FlushResponse {
  results?: FlushResult[];
}

export function AdminDevTools() {
  const [impEnabled, setImpEnabled] = useState(false);
  const [probeLoading, setProbeLoading] = useState(true);
  const [impUserId, setImpUserId] = useState('');
  const [impLoading, setImpLoading] = useState(false);
  const [flushTarget, setFlushTarget] = useState<'cron_locks' | 'cache' | 'sessions' | 'all'>('cron_locks');
  const [flushLoading, setFlushLoading] = useState(false);
  const [flushResults, setFlushResults] = useState<FlushResult[] | null>(null);
  const [confirmEl, confirm] = useConfirm();

  const router = useRouter();

  const probeImp = useCallback(async () => {
    try {
      const data = await apiFetch<ProbeResponse>('/api/admin/impersonate/probe');
      setImpEnabled(data.enabled);
    } catch {
      setImpEnabled(false);
    } finally {
      setProbeLoading(false);
    }
  }, []);

  useEffect(() => {
    void probeImp();
  }, [probeImp]);

  async function handleImpersonate() {
    const userId = impUserId.trim();
    if (!userId) return;

    const ok = await confirm({
      title: 'Impersonate user?',
      description: `You will be signed in as ${userId}. Click "Exit Impersonation" in the banner to return.`,
      confirmLabel: 'Impersonate',
      tone: 'danger',
    });
    if (!ok) return;

    setImpLoading(true);
    try {
      const data = await apiMutate<{ redirect: string }>('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      router.push(data.redirect);
    } catch (err) {
      toastApiError(err, 'Failed to impersonate');
    } finally {
      setImpLoading(false);
    }
  }

  async function handleFlush() {
    const ok = await confirm({
      title: 'Flush system resources?',
      description: `Target: ${flushTarget}. This may affect production behavior.`,
      confirmLabel: 'Flush',
      tone: 'danger',
    });
    if (!ok) return;

    setFlushLoading(true);
    setFlushResults(null);
    try {
      const data = await apiMutate<FlushResponse>('/api/admin/flush', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: flushTarget }),
      });

      if (data.results) {
        setFlushResults(data.results);
      } else {
        toast.success('Flush completed');
      }
    } catch (err) {
      toastApiError(err, 'Flush failed');
    } finally {
      setFlushLoading(false);
    }
  }

  if (probeLoading) {
    return <SkeletonCard lines={4} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {impEnabled && (
        <SettingsSection
          title="Impersonate"
          description="Sign in as another user for debugging. Only available in dev."
        >
          <div className="border-border bg-bg-elev-1 flex flex-col gap-4 rounded-sm border p-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="impersonate-user-id" className="text-sm font-medium">
                Target user ID
              </label>
              <Input
                id="impersonate-user-id"
                type="text"
                placeholder="Enter user ID to impersonate"
                value={impUserId}
                onChange={(e) => setImpUserId(e.target.value)}
              />
            </div>
            <Button variant="danger" loading={impLoading} onClick={handleImpersonate}>
              Impersonate
            </Button>
          </div>
        </SettingsSection>
      )}

      <SettingsSection title="Maintenance" description="Flush caches, locks, and sessions.">
        <div className="border-border bg-bg-elev-1 flex flex-col gap-4 rounded-sm border p-4">
          <div className="flex items-center gap-2">
            <label htmlFor="flush-target" className="text-sm font-medium shrink-0">
              Target:
            </label>
            <select
              id="flush-target"
              value={flushTarget}
              onChange={(e) => setFlushTarget(e.target.value as typeof flushTarget)}
              className="bg-bg-elev-2 border-border rounded-sm border px-3 py-2 text-sm text-fg"
            >
              <option value="cron_locks">Cron locks</option>
              <option value="cache">Cache</option>
              <option value="sessions">Sessions</option>
              <option value="all">All</option>
            </select>
          </div>
          <Button variant="danger" loading={flushLoading} onClick={handleFlush}>
            Flush
          </Button>

          {flushResults && (
            <div className="flex flex-col gap-2 pt-2">
              {flushResults.map((r) => (
                <div
                  key={r.target}
                  className={cn(
                    'rounded-sm border px-3 py-2 text-sm',
                    r.status === 'flushed'
                      ? 'border-success/20 bg-success/5 text-success'
                      : 'border-warn/20 bg-warn/5 text-warn',
                  )}
                >
                  <span className="font-medium">{r.target}:</span>{' '}
                  {r.status === 'flushed' ? 'Flushed' : 'Unsupported'}
                  {typeof r.affected === 'number' && <> ({r.affected} affected)</>}
                  {r.reason && <> — {r.reason}</>}
                </div>
              ))}
            </div>
          )}
        </div>
      </SettingsSection>
      {confirmEl}
    </div>
  );
}
