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

interface ToolTelemetryRow {
  id: string;
  threadId: string;
  tool: string;
  ms: number;
  ok: boolean;
  errorCode: string | null;
  createdAt: string;
}

export function AdminToolTelemetryTable() {
  const [rows, setRows] = useState<ToolTelemetryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchRows = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/admin/diagnostics/tool-telemetry?limit=50');
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { entries: ToolTelemetryRow[] };
      setRows(data.entries);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load tool telemetry';
      setFetchError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return <SkeletonCard lines={4} />;
  }

  if (fetchError) {
    return (
      <SettingsSection title="Tool Telemetry" description="Recent AI tool calls.">
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-danger">{fetchError}</p>
          <button type="button" onClick={fetchRows} className="text-sm text-fg underline hover:no-underline">
            Retry
          </button>
        </div>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title="Tool Telemetry" description="Recent AI tool calls.">
      <div className="border-border overflow-hidden rounded-sm border">
        <table className="w-full text-sm">
          <thead className="bg-bg-elev-2 text-fg-subtle">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Tool</th>
              <th className="px-4 py-2 text-left font-medium">Thread</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-left font-medium">ms</th>
              <th className="px-4 py-2 text-left font-medium">Error</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-fg-subtle px-4 py-4 text-center">
                  No telemetry found.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-border border-t">
                  <td className="text-fg px-4 py-2 font-mono text-xs">{row.tool}</td>
                  <td className="text-fg-subtle px-4 py-2 font-mono text-xs">{row.threadId}</td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        'rounded-sm px-2 py-0.5 text-xs font-bold uppercase',
                        row.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
                      )}
                    >
                      {row.ok ? 'OK' : 'FAIL'}
                    </span>
                  </td>
                  <td className="text-fg-subtle px-4 py-2 tabular-nums">{row.ms}</td>
                  <td className="text-fg-subtle px-4 py-2">{row.errorCode ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </SettingsSection>
  );
}
