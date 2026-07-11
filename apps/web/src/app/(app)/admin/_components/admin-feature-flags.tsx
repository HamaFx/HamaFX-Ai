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

'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Switch } from '@/components/ui/switch';
import { SkeletonCard } from '@/components/ui/skeleton';
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { fetchCsrf } from '@/lib/csrf';

export function AdminFeatureFlags() {
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchFeatures() {
      try {
        const res = await fetch('/api/admin/features');
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as { features: Record<string, boolean> };
        setFeatures(data.features);
      } catch {
        toast.error('Failed to load feature flags');
      } finally {
        setLoading(false);
      }
    }
    void fetchFeatures();
  }, []);

  async function toggle(key: string, next: boolean) {
    try {
      const res = await fetchCsrf('/api/admin/features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: next }),
      });
      if (!res.ok) throw new Error(await res.text());
      setFeatures((prev) => ({ ...prev, [key]: next }));
      toast.success(`Feature ${key} ${next ? 'enabled' : 'disabled'}`);
    } catch {
      toast.error('Failed to update feature flag');
    }
  }

  if (loading) {
    return <SkeletonCard lines={4} />;
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
