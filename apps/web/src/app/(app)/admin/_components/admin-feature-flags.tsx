// SPDX-License-Identifier: Apache-2.0

'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SkeletonCard } from '@/components/ui/skeleton';
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { apiFetch, apiMutate } from '@/lib/api-client';

export function AdminFeatureFlags() {
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFeatures = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ features: Record<string, boolean> }>('/api/admin/features');
      setFeatures(data.features);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      toast.error('Failed to load feature flags');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchFeatures();
  }, [fetchFeatures]);

  async function toggle(key: string, next: boolean) {
    try {
      await apiMutate('/api/admin/features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: next }),
      });
      setFeatures((prev) => ({ ...prev, [key]: next }));
      toast.success(`Feature ${key} ${next ? 'enabled' : 'disabled'}`);
    } catch {
      toast.error('Failed to update feature flag');
    }
  }

  if (loading) {
    return <SkeletonCard lines={4} />;
  }

  if (error) {
    return (
      <SettingsSection title="Feature Flags" description="Toggle runtime feature flags.">
        <div className="border-border bg-bg-elev-1 flex flex-col items-center gap-3 rounded-sm border p-6">
          <p className="text-danger text-sm">{error}</p>
          <Button variant="secondary" size="sm" onClick={() => void fetchFeatures()}>
            Retry
          </Button>
        </div>
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
              <span className="text-fg text-sm font-medium">{key}</span>
              <Switch
                checked={value}
                onCheckedChange={(next) => void toggle(key, next)}
                srLabel={`Toggle ${key}`}
              />
            </div>
          ))
        )}
      </div>
    </SettingsSection>
  );
}
