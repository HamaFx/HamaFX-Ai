'use client';

// Wires the form, list, and stats summary together. Single TanStack Query
// for /api/journal so the stats stay in sync with the list (one fetch).

import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { JournalEntry, JournalStats } from '@hamafx/shared';

import { EntryForm } from './entry-form';
import { EntryList } from './entry-list';
import { StatsSummary } from './stats-summary';

const QKEY = ['journal'] as const;

interface JournalResponse {
  entries: JournalEntry[];
  stats: JournalStats;
}

export function JournalView() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery<JournalResponse>({
    queryKey: QKEY,
    queryFn: async () => {
      const res = await fetch('/api/journal');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as JournalResponse;
    },
    staleTime: 10_000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: QKEY });

  return (
    <div className="flex flex-col gap-4">
      {data?.stats ? <StatsSummary stats={data.stats} /> : null}
      <EntryForm onCreated={refresh} />
      {isLoading ? (
        <p className="text-fg-muted text-xs">Loading…</p>
      ) : isError ? (
        <p className="text-bear text-xs">Failed to load: {(error as Error)?.message}</p>
      ) : (
        <EntryList entries={data?.entries ?? []} onClosed={refresh} onDeleted={refresh} />
      )}
    </div>
  );
}
