'use client';

// Wires the form (in a Drawer), list, and stats summary together.
import type { JournalEntry, JournalStats } from '@hamafx/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Fab } from '@/components/ui/fab';
import { StaleIndicator } from '@/components/ui/stale-indicator';

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
  const [open, setOpen] = useState(false);
  const { data, isLoading, isFetching, isError, error } = useQuery<JournalResponse>({
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
      <div className="flex items-center justify-end">
        <StaleIndicator isFetching={isFetching && !isLoading} />
      </div>
      {data?.stats ? <StatsSummary stats={data.stats} entries={data.entries} /> : null}
      {isLoading ? (
        <p className="text-fg-muted text-xs">Loading…</p>
      ) : isError ? (
        <p className="text-bear text-xs">Failed to load: {(error as Error)?.message}</p>
      ) : (
        <EntryList entries={data?.entries ?? []} onClosed={refresh} onDeleted={refresh} />
      )}

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Log trade</DrawerTitle>
            <DrawerDescription>
              Record entry, stop, target. Stats compute on close.
            </DrawerDescription>
          </DrawerHeader>
          <EntryForm
            onCreated={() => {
              refresh();
              setOpen(false);
            }}
          />
        </DrawerContent>
      </Drawer>

      <Fab onClick={() => setOpen(true)} aria-label="Log new trade">
        <Plus className="size-6" />
      </Fab>
    </div>
  );
}
