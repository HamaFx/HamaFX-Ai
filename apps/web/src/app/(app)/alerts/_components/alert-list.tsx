'use client';

// Client list with toggle-active + delete. Uses TanStack Query so the form
// can invalidate after creating.
import type { Alert } from '@hamafx/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

import { AlertForm } from './alert-form';

export const ALERTS_QUERY_KEY = ['alerts'] as const;

export function AlertList() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery<{ alerts: Alert[] }>({
    queryKey: ALERTS_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch('/api/alerts');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as { alerts: Alert[] };
    },
    staleTime: 10_000,
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await fetch(`/api/alerts/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active, firedAt: active ? null : undefined }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ALERTS_QUERY_KEY }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/alerts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ALERTS_QUERY_KEY }),
  });

  return (
    <div className="flex flex-col gap-4">
      <AlertForm onCreated={() => qc.invalidateQueries({ queryKey: ALERTS_QUERY_KEY })} />

      {isLoading ? (
        <p className="text-fg-muted text-xs">Loading…</p>
      ) : isError ? (
        <p className="text-bear text-xs">Failed to load: {(error as Error)?.message}</p>
      ) : data?.alerts.length === 0 ? (
        <p className="text-fg-subtle text-xs">No alerts yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data?.alerts.map((a) => (
            <li
              key={a.id}
              className={cn(
                'border-border bg-bg-elev-1 flex items-start gap-3 rounded-lg border p-3',
                !a.active && 'opacity-60',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                  a.active ? 'bg-bull' : a.firedAt ? 'bg-warn' : 'bg-fg-subtle',
                )}
                title={a.active ? 'armed' : a.firedAt ? 'fired' : 'paused'}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium tabular-nums">{describe(a)}</p>
                <p className="text-fg-subtle mt-0.5 truncate text-[11px]">
                  {a.firedAt
                    ? `fired ${formatRelative(a.firedAt)}`
                    : `created ${formatRelative(a.createdAt)}`}
                  {a.note ? ` · ${a.note}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={a.active ? 'ghost' : 'secondary'}
                  onClick={() => toggle.mutate({ id: a.id, active: !a.active })}
                >
                  {a.active ? 'Pause' : 'Re-arm'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => remove.mutate(a.id)}
                  className="text-bear"
                  aria-label="Delete alert"
                >
                  ✕
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function describe(a: Alert): string {
  const r = a.rule;
  switch (r.type) {
    case 'priceCross':
      return `${r.symbol} price ${r.direction} ${r.level}`;
    case 'candleClose':
      return `${r.symbol} ${r.tf} close ${r.direction} ${r.level}`;
    case 'indicatorCross':
      return `${r.symbol} ${r.tf} ${r.indicator} ${r.direction} ${r.level}`;
  }
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
