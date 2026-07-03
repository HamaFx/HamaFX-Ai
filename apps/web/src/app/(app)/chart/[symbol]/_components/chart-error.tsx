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

import { AlertCircle, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

interface ChartErrorProps {
  error: Error;
  onRetry: () => void;
}

export function ChartError({ error, onRetry }: ChartErrorProps) {
  const isQuota = /quota|throttle|rate.?limit/i.test(error.message);

  return (
    <div className="aspect-[16/9] w-full md:aspect-[21/9]">
      <EmptyState
        tone="muted"
        icon={<AlertCircle className="text-red-500 size-7" strokeWidth={2} />}
        title={isQuota ? 'Rate limited' : 'Failed to load chart'}
        description={error.message.slice(0, 140)}
        action={
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            <RotateCcw className="size-4" /> Retry
          </Button>
        }
        className="h-full justify-center"
      />
    </div>
  );
}
