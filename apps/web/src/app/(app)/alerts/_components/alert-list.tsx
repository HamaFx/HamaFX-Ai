'use client';

// Alerts list with FAB → Drawer for create. Mobile-first card layout:
// p-4 (16px), gap-3 (12) between status badge and content, 44×44 action
// buttons in a vertical stack on the right.
import type { Alert } from '@hamafx/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  BarChart3,
  Bell,
  BellOff,
  BellRing,
  Plus,
  RotateCw,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-drawer';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Fab } from '@/components/ui/fab';
import { StaleIndicator } from '@/components/ui/stale-indicator';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { fetchCsrf } from '@/lib/csrf';

import { AlertForm } from './alert-form';

export const ALERTS_QUERY_KEY = ['alerts'] as const;

export function AlertList() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirmEl, confirm] = useConfirm();

  const { data, isLoading, isFetching, isError, error } = useQuery<{ alerts: Alert[] }>({
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
      const res = await fetchCsrf(`/api/alerts/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active, firedAt: active ? null : undefined }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ALERTS_QUERY_KEY });
      toast.success(vars.active ? 'Re-armed' : 'Paused');
    },
    onError: (err) => toast.error('Update failed', { description: (err as Error).message }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetchCsrf(`/api/alerts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ALERTS_QUERY_KEY });
      toast.success('Alert deleted');
    },
    onError: (err) => toast.error('Delete failed', { description: (err as Error).message }),
  });

  async function handleDelete(alert: Alert) {
    const ok = await confirm({
      title: 'Delete this alert?',
      description: describe(alert),
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (ok) remove.mutate(alert.id);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <StaleIndicator isFetching={isFetching && !isLoading} />
      </div>
      {isLoading ? (
        <p className="text-fg-muted text-sm">Loading…</p>
      ) : isError ? (
        <p className="text-bear text-sm">Failed to load: {(error as Error)?.message}</p>
      ) : data?.alerts.length === 0 ? (
        <EmptyState
          tone="brand"
          icon={<BellOff className="size-10" strokeWidth={1.5} />}
          title="No alerts yet"
          description="Get notified when a price level, indicator, or candle close triggers."
          action={
            <Button type="button" onClick={() => setOpen(true)}>
              <Plus className="size-4" />
              Create your first alert
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {data?.alerts.map((a) => (
            <AlertRow
              key={a.id}
              alert={a}
              onToggle={() => toggle.mutate({ id: a.id, active: !a.active })}
              onDelete={() => void handleDelete(a)}
            />
          ))}
        </ul>
      )}

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>New alert</DrawerTitle>
            <DrawerDescription>Set a price, indicator, or candle-close trigger.</DrawerDescription>
          </DrawerHeader>
          <AlertForm
            onCreated={() => {
              qc.invalidateQueries({ queryKey: ALERTS_QUERY_KEY });
              setOpen(false);
            }}
          />
        </DrawerContent>
      </Drawer>

      {data && data.alerts.length > 0 ? (
        <Fab onClick={() => setOpen(true)} aria-label="Create alert">
          <Plus className="size-6" />
        </Fab>
      ) : null}

      {confirmEl}
    </div>
  );
}

interface AlertRowProps {
  alert: Alert;
  onToggle: () => void;
  onDelete: () => void;
}

function AlertRow({ alert, onToggle, onDelete }: AlertRowProps) {
  const RuleIcon = ruleIcon(alert);
  const StatusIcon = alert.active ? Bell : alert.firedAt ? BellRing : BellOff;
  const statusTone = alert.active ? 'text-bull' : alert.firedAt ? 'text-warn' : 'text-fg-subtle';

  return (
    <li
      className={cn(
        'card-premium flex items-start gap-3 p-4 transition-opacity',
        !alert.active && 'opacity-70',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'inline-flex size-12 shrink-0 items-center justify-center rounded-xl',
          statusTone,
        )}
        style={{
          background: alert.active
            ? 'oklch(72% 0.2 152 / 0.15)'
            : alert.firedAt
              ? 'oklch(82% 0.16 80 / 0.15)'
              : 'oklch(70% 0.02 265 / 0.1)',
          boxShadow: 'var(--shadow-inset-edge-soft)',
        }}
      >
        <StatusIcon className="size-5" strokeWidth={2} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="text-fg flex items-center gap-2 text-sm font-semibold tabular-nums">
          <RuleIcon className="text-fg-muted size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{describe(alert)}</span>
        </div>
        <p className="text-fg-subtle mt-1.5 truncate text-xs">
          {alert.firedAt
            ? `fired ${formatRelative(alert.firedAt)}`
            : `created ${formatRelative(alert.createdAt)}`}
          {alert.note ? ` · ${alert.note}` : ''}
        </p>
      </div>

      <div className="flex shrink-0 flex-col gap-1">
        <Tooltip label={alert.active ? 'Pause' : 'Re-arm'}>
          <button
            type="button"
            onClick={onToggle}
            aria-label={alert.active ? 'Pause alert' : 'Re-arm alert'}
            className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 inline-flex size-11 items-center justify-center rounded-full transition-colors"
          >
            {alert.active ? <BellOff className="size-4" /> : <RotateCw className="size-4" />}
          </button>
        </Tooltip>
        <Tooltip label="Delete">
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete alert"
            className="text-bear/70 hover:text-bear hover:bg-bear/10 inline-flex size-11 items-center justify-center rounded-full transition-colors"
          >
            <Trash2 className="size-4" />
          </button>
        </Tooltip>
      </div>
    </li>
  );
}

function ruleIcon(a: Alert) {
  switch (a.rule.type) {
    case 'priceCross':
      return TrendingUp;
    case 'indicatorCross':
      return Activity;
    case 'candleClose':
      return BarChart3;
  }
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
