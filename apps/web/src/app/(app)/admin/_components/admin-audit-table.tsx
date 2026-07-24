// SPDX-License-Identifier: Apache-2.0

'use client';

import { useCallback, useEffect, useState } from 'react';
import { IconHistory, IconDownload } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCard } from '@/components/ui/skeleton';
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { AdminErrorBlock } from './admin-error-block';
import { apiFetch } from '@/lib/api-client';
import { toastApiError } from '@/lib/toast-api-error';
import { formatRelativeTime, formatAbsoluteTime, downloadCSV } from '@/lib/format-number';

interface AuditEntry {
  id: string;
  actorUserId: string;
  action: string;
  targetUserId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditResponse {
  entries: AuditEntry[];
}

export function AdminAuditTable() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await apiFetch<AuditResponse>(
        `/api/admin/audit?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
      );
      setEntries(data.entries);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load audit log';
      setFetchError(msg);
      toastApiError(err, msg);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void fetchEntries();
  }, [fetchEntries]);

  function handleExport() {
    downloadCSV(
      entries.map((e) => ({
        action: e.action,
        actorUserId: e.actorUserId,
        targetUserId: e.targetUserId ?? '',
        metadata: e.metadata ? JSON.stringify(e.metadata) : '',
        createdAt: e.createdAt,
      })),
      `audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }

  if (loading) {
    return <SkeletonCard lines={4} />;
  }

  if (fetchError) {
    return (
      <SettingsSection title="Audit Log" description="Privileged admin actions.">
        <AdminErrorBlock message={fetchError} onRetry={() => void fetchEntries()} />
      </SettingsSection>
    );
  }

  const description = 'Privileged admin actions.';

  return (
    <SettingsSection title="Audit Log" description={description}>
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => void fetchEntries()}>
            Refresh
          </Button>
          {entries.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleExport}>
              <IconDownload className="size-4" aria-hidden="true" />
              CSV
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={entries.length < PAGE_SIZE}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <div className="border-border overflow-x-auto overflow-hidden rounded-sm border">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="bg-bg-elev-2 text-fg-subtle">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Action</th>
              <th className="px-4 py-2 text-left font-medium">Actor</th>
              <th className="px-4 py-2 text-left font-medium">Target</th>
              <th className="px-4 py-2 text-left font-medium">Details</th>
              <th className="px-4 py-2 text-left font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6">
                  <EmptyState
                    icon={<IconHistory className="size-6" />}
                    title="No audit entries"
                    description="Privileged admin actions will appear here."
                    bare
                  />
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="border-border border-t">
                  <td className="text-fg px-4 py-2 font-medium">{entry.action}</td>
                  <td className="text-fg-subtle font-mono px-4 py-2 text-xs">{entry.actorUserId}</td>
                  <td className="text-fg-subtle px-4 py-2 font-mono text-xs">
                    {entry.targetUserId ?? '—'}
                  </td>
                  <td className="text-fg-subtle px-4 py-2 text-xs">
                    {entry.metadata && Object.keys(entry.metadata).length > 0
                      ? JSON.stringify(entry.metadata)
                      : '—'}
                  </td>
                  <td className="text-fg-subtle px-4 py-2">
                    <span title={formatAbsoluteTime(entry.createdAt)}>
                      {formatRelativeTime(entry.createdAt)}
                    </span>
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
