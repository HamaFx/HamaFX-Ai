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

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { fetchCsrf } from '@/lib/csrf';

export function OnboardingResetCard() {
  const router = useRouter();
  const [resetting, setResetting] = useState(false);
  const [fullReset, setFullReset] = useState(false);

  async function handleReset() {
    if (!confirm('Reset onboarding? You will need to go through the wizard again.')) return;
    setResetting(true);
    try {
      const res = await fetchCsrf('/api/admin/onboarding/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: fullReset ? 'full' : 'soft' }),
      });
      if (!res.ok) throw new Error(await res.text());
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
    </div>
  );
}
