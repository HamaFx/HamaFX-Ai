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

import { SkeletonCard } from '@/components/ui/skeleton';
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { cn } from '@/lib/cn';

interface DiagnosticTraceSummary {
  id: string;
  threadId: string;
  userId: string;
  startedAt: string;
  finishedAt: string | null;
  stepCount: number;
  errorCount: number;
}

export function AdminDiagnosticTraces() {
  const [traces, setTraces] = useState<DiagnosticTraceSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTraces() {
      try {
        const res = await fetch('/api/admin/diagnostics/traces?limit=20');
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as { traces: DiagnosticTraceSummary[] };
        setTraces(data.traces);
      } catch {
        toast.error('Failed to load diagnostic traces');
      } finally {
        setLoading(false);
      }
    }
    void fetchTraces();
  }, []);

  if (loading) {
    return <SkeletonCard lines={4} />;
  }

  return (
    <SettingsSection title="Diagnostic Traces" description="Recent chat diagnostic traces.">
      <div className="border-border overflow-hidden rounded-sm border">
        <table className="w-full text-sm">
          <thead className="bg-bg-elev-2 text-fg-subtle">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Thread</th>
              <th className="px-4 py-2 text-left font-medium">Steps</th>
              <th className="px-4 py-2 text-left font-medium">Errors</th>
              <th className="px-4 py-2 text-left font-medium">Started</th>
            </tr>
          </thead>
          <tbody>
            {traces.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-fg-subtle px-4 py-4 text-center">
                  No traces found.
                </td>
              </tr>
            ) : (
              traces.map((trace) => (
                <tr key={trace.id} className="border-border border-t">
                  <td className="text-fg px-4 py-2 font-mono text-xs">{trace.threadId}</td>
                  <td className="text-fg-subtle px-4 py-2 tabular-nums">{trace.stepCount}</td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        'rounded-sm px-2 py-0.5 text-xs font-bold uppercase',
                        trace.errorCount > 0 ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success',
                      )}
                    >
                      {trace.errorCount}
                    </span>
                  </td>
                  <td className="text-fg-subtle px-4 py-2">
                    {new Date(trace.startedAt).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </SettingsSection>
  );
}
