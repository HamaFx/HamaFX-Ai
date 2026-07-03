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

// Phase 1.6 — Equity curve widget.
//
// Wraps the existing `PerformanceChart` so it fits the dashboard's
// widget chrome. We trim the chart's own header so the surrounding
// canvas label remains the primary visual anchor.

import type { JournalEntry } from '@hamafx/shared';

import { PerformanceChart } from '@/components/chart/performance-chart';

interface EquityCurveWidgetProps {
  entries: readonly JournalEntry[];
}

export function EquityCurveWidget({ entries }: EquityCurveWidgetProps) {
  return (
    <section
      aria-label="Equity curve"
      className="border-zinc-800 bg-zinc-950 flex flex-col gap-3 rounded-sm border p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <span className="text-fg text-body-sm font-semibold">Equity curve</span>
      </header>
      <PerformanceChart entries={[...entries]} height={200} />
    </section>
  );
}
