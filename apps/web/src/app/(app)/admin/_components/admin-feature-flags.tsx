// SPDX-License-Identifier: Apache-2.0

'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Switch } from '@/components/ui/switch';
import { useConfirm } from '@/components/ui/confirm-drawer';
import { SkeletonCard } from '@/components/ui/skeleton';
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { AdminErrorBlock } from './admin-error-block';
import { apiFetch, apiMutate } from '@/lib/api-client';
import { toastApiError } from '@/lib/toast-api-error';
import type { FeatureFlagsDTO } from '@/lib/services/admin-dtos';

interface FlagMeta {
  label: string;
  description: string;
  danger?: boolean;
}

const FLAG_META: Record<string, FlagMeta> = {
  newDashboard: { label: 'New Dashboard', description: 'Enables the redesigned dashboard layout.' },
  betaChat: { label: 'Beta Chat', description: 'Enables experimental chat features.', danger: true },
  multiAgent: { label: 'Multi-Agent', description: 'Enables multi-agent committee deliberation.', danger: true },
  advancedTools: { label: 'Advanced Tools', description: 'Enables advanced AI tools (risk assessment, COT analysis).' },
};

function flagLabel(key: string): string {
  return FLAG_META[key]?.label ?? key;
}

function flagDescription(key: string): string {
  return FLAG_META[key]?.description ?? '';
}

function flagIsDanger(key: string): boolean {
  return FLAG_META[key]?.danger ?? false;
}

export function AdminFeatureFlags() {
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [confirmEl, confirm] = useConfirm();

  const fetchFeatures = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<FeatureFlagsDTO>('/api/admin/features');
      setFeatures(data.features);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      toastApiError(err, msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchFeatures();
  }, [fetchFeatures]);

  async function toggle(key: string, next: boolean) {
    if (pending.has(key)) return;

    // For danger flags, require explicit confirmation before toggling ON.
    if (next && flagIsDanger(key)) {
      const ok = await confirm({
        title: `Enable "${flagLabel(key)}"?`,
        description: `This flag is marked as high-risk. ${flagDescription(key)}`,
        confirmLabel: 'Enable',
        tone: 'danger',
      });
      if (!ok) return;
    }

    const prevValue = features[key];
    setPending((s) => new Set(s).add(key));
    setFeatures((prev) => ({ ...prev, [key]: next }));

    try {
      await apiMutate('/api/admin/features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: next }),
      });
      toast.success(`${flagLabel(key)} ${next ? 'enabled' : 'disabled'}`);
    } catch (err) {
      setFeatures((prev) => ({ ...prev, [key]: prevValue } as Record<string, boolean>));
      toastApiError(err, 'Failed to update feature flag');
    } finally {
      setPending((s) => {
        const copy = new Set(s);
        copy.delete(key);
        return copy;
      });
    }
  }

  if (loading) {
    return <SkeletonCard lines={4} />;
  }

  if (error) {
    return (
      <SettingsSection title="Feature Flags" description="Toggle runtime feature flags.">
        <AdminErrorBlock message={error} onRetry={() => void fetchFeatures()} />
      </SettingsSection>
    );
  }

  const entries = Object.entries(features);

  return (
    <SettingsSection title="Feature Flags" description="Toggle runtime feature flags.">
      <div className="border-border bg-bg-elev-1 flex flex-col gap-4 rounded-sm border p-4">
        {entries.length === 0 ? (
          <p className="text-fg-subtle text-sm">No feature flags configured.</p>
        ) : (
          entries.map(([key, value]) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-fg text-sm font-medium">{flagLabel(key)}</span>
                {flagDescription(key) && (
                  <span className="text-fg-subtle text-xs">{flagDescription(key)}</span>
                )}
              </div>
              <Switch
                checked={value}
                onCheckedChange={(next) => void toggle(key, next)}
                disabled={pending.has(key)}
                srLabel={`Toggle ${flagLabel(key)}`}
              />
            </div>
          ))
        )}
      </div>
      {confirmEl}
    </SettingsSection>
  );
}
