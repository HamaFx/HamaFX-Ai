'use client';

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

// Refresh button — calls the cron endpoint (session-cookie auth) then
// asks Next to revalidate the server component. Confirmation/error
// surface through sonner toasts (no inline status string).

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

interface RefreshButtonProps {
  endpoint: string;
  label?: string;
}

export function RefreshButton({ endpoint, label = 'Refresh now' }: RefreshButtonProps) {
  const [pending, startTransition] = useTransition();
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const isLoading = refreshing || pending;

  function refresh() {
    setRefreshing(true);
    startTransition(async () => {
      try {
        const res = await fetch(endpoint);
        if (res.ok) {
          const json = (await res.json().catch(() => ({}))) as {
            processed?: number;
            note?: string;
          };
          toast.success('Refreshed', {
            description: json.note ?? `Processed ${json.processed ?? 0} items`,
          });
          router.refresh();
        } else {
          toast.error('Refresh failed', { description: `HTTP ${res.status}` });
        }
      } catch (err) {
        toast.error('Refresh failed', {
          description: err instanceof Error ? err.message : 'Network error',
        });
      } finally {
        setRefreshing(false);
      }
    });
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={refresh}
      loading={isLoading}
      className="focus-visible:ring-fg min-h-[44px] focus-visible:ring-2"
    >
      <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
      {isLoading ? 'Loading…' : label}
    </Button>
  );
}
