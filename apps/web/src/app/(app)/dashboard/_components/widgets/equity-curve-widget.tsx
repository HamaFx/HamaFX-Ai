// SPDX-License-Identifier: Apache-2.0

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
      className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <span className="text-fg text-body-sm font-semibold">Equity curve</span>
      </header>
      <PerformanceChart entries={[...entries]} height={200} />
    </section>
  );
}
