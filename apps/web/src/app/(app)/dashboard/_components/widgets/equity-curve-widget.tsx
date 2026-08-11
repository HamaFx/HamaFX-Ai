// SPDX-License-Identifier: Apache-2.0

'use client';

// Phase 1.6 — Equity curve widget.
//
// Wraps the existing `PerformanceChart` so it fits the dashboard's
// widget chrome. We trim the chart's own header so the surrounding
// canvas label remains the primary visual anchor.

import type { JournalEntry } from '@kestrel/shared';

import { IconChartLine } from '@tabler/icons-react';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PerformanceChart } from '@/components/chart/performance-chart';

interface EquityCurveWidgetProps {
  entries: readonly JournalEntry[];
}

export function EquityCurveWidget({ entries }: EquityCurveWidgetProps) {
  return (
    <Card as="section" aria-label="Equity curve">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconChartLine className="text-fg-subtle size-4" aria-hidden="true" />
          <div><h2 className="text-fg text-body-sm font-semibold">Performance</h2><p className="text-fg-subtle text-caption">Cumulative R-multiple</p></div>
        </div>
        <Badge tone="neutral">Closed trades</Badge>
      </header>
      <div className="border-divider border-t pt-3"><PerformanceChart entries={[...entries]} height={200} /></div>
    </Card>
  );
}
