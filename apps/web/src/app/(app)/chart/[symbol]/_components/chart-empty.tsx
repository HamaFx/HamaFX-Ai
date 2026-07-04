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

import type { Symbol, Timeframe } from '@hamafx/shared';
import {IconChartLine, IconArrowBackUp} from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

interface ChartEmptyProps {
  symbol: Symbol;
  tf: Timeframe;
  onRetry: () => void;
}

export function ChartEmpty({ symbol, tf, onRetry }: ChartEmptyProps) {
  return (
    <div className="aspect-[16/9] w-full md:aspect-[21/9]">
      <EmptyState
        tone="muted"
        icon={<IconChartLine className="size-7" strokeWidth={1.75} />}
        title="No data available"
        description={`No candles for ${symbol} @ ${tf}. Market may be closed.`}
        action={
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            <IconArrowBackUp className="size-4" /> Retry
          </Button>
        }
        className="h-full justify-center"
      />
    </div>
  );
}
