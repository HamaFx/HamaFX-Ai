'use client';

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

import type { Alert } from '@hamafx/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconActivity,  IconChartBar,  IconBell,  IconBellOff,  IconBellRinging,  IconMail,  IconPlus,  IconRefresh,  IconArrowRight,  IconTrash,  IconTrendingUp } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
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
import { Segmented } from '@/components/ui/segmented';
import { StaleIndicator } from '@/components/ui/stale-indicator';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { fetchCsrf } from '@/lib/csrf';
import { formatRelative } from '@/lib/format';

import { AlertForm } from './alert-form';

export const ALERTS_QUERY_KEY = ['alerts'] as const;

export function AlertList() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'past'>('all');
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

  const filteredAlerts = data?.alerts.filter((a) => {
    if (filter === 'active') return a.active && !a.firedAt;
    if (filter === 'past') return !!a.firedAt || !a.active;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="w-[200px]">
          <Segmented<'all' | 'active' | 'past'>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'past', label: 'Past' },
            ]}
            variant="solid"
            size="sm"
          />
        </div>
        <StaleIndicator isFetching={isFetching && !isLoading} />
      </div>

      {isLoading ? (
        <p className="text-fg-muted text-sm px-1">Loading…</p>
      ) : isError ? (
        <p className="text-danger text-sm px-1" role="alert">Failed to load: {(error as Error)?.message}</p>
      ) : data?.alerts.length === 0 ? (
        <EmptyState
          tone="muted"
          icon={<IconBell className="size-7" strokeWidth={1.75} />}
          title="No alerts configured"
          description="Create price alerts to get notified when the market hits your targets."
          action={
            <Button type="button" onClick={() => setOpen(true)}>
              <IconPlus className="size-4" />
              Create alert
            </Button>
          }
        />
      ) : filteredAlerts?.length === 0 ? (
        <div className="py-12 text-center text-sm text-fg-muted">
          No {filter} alerts found.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {filteredAlerts?.map((a) => (
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
        <div className="flex justify-end">
          <Button type="button" onClick={() => setOpen(true)}>
            <IconPlus className="size-4" />
            New alert
          </Button>
        </div>
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
  const StatusIcon = alert.active ? IconBell : alert.firedAt ? IconBellRinging : IconBellOff;
  const statusTone = alert.active ? 'text-fg' : alert.firedAt ? 'text-warn' : 'text-fg-subtle';

  const trackRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    const content = contentRef.current;
    if (!track || !content) return;

    const initialScroll = () => {
      track.scrollLeft = track.clientWidth;
    };

    initialScroll();

    const resizeOb = new ResizeObserver(() => {
      initialScroll();
    });
    resizeOb.observe(track);

    let isTriggered = false;
    let timer: ReturnType<typeof setTimeout>;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        const ratio = entry.intersectionRatio;

        if (ratio > 0.95) {
          isTriggered = false;
          return;
        }

        const commitThreshold = 0.3;
        if (ratio < commitThreshold && !isTriggered) {
          isTriggered = true;
          const direction = (entry.boundingClientRect.x - (entry.rootBounds?.x ?? 0)) > 0 ? 'left' : 'right';

          if (direction === 'left') {
            onToggle();
          } else {
            onDelete();
          }

          timer = setTimeout(() => {
            track.scrollTo({ left: track.clientWidth, behavior: 'smooth' });
          }, 300);
        }
      },
      {
        root: track,
        threshold: [0.3, 0.95],
      }
    );

    observer.observe(content);

    return () => {
      resizeOb.disconnect();
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [onToggle, onDelete]);

  return (
    <li className="relative overflow-hidden rounded-sm border border-border bg-bg-elev-1 transition-all duration-200 hover:shadow-lg">
      <div
        ref={trackRef}
        className="grid overflow-x-auto scrollbar-none overscroll-behavior-x-none select-none"
        style={{
          gridTemplateColumns: '100% 100% 100%',
          scrollSnapType: 'x mandatory',
        }}
      >
        {/* Left Option (Re-arm / Pause) */}
        <div 
          className="flex w-full items-center justify-start pl-6 bg-bg-elev-2 text-fg"
          style={{ scrollSnapAlign: 'start' }}
        >
          <StatusIcon className="size-5 animate-pulse" />
        </div>

        {/* Content (Main Alert Card) */}
        <div
          ref={contentRef}
          className={cn(
            'flex w-full items-start gap-3 p-4 bg-bg-elev-1 transition-opacity duration-200',
            !alert.active && 'opacity-60 saturate-50',
          )}
          style={{ scrollSnapAlign: 'center' }}
        >
          {/* Touch-swipe grabber — visible only on touch devices */}
          <span
            aria-hidden
            className="self-stretch flex items-center touch-swipe-hint text-fg-muted/30"
          >
            ≡
          </span>
          <div className="relative">
            <span
              aria-hidden
              className={cn(
                'inline-flex size-12 shrink-0 items-center justify-center rounded-sm',
                statusTone,
              )}
              style={{
                background: alert.active
                  ? 'none'
                  : alert.firedAt
                    ? 'rgba(245, 158, 11, 0.12)'
                    : 'rgba(59, 130, 246, 0.08)',
                boxShadow: 'none',
              }}
            >
              <StatusIcon className="size-5" strokeWidth={1.75} />
            </span>
            {alert.active && !alert.firedAt && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-sm bg-fg opacity-75"></span>
                <span className="relative inline-flex rounded-sm h-3 w-3 bg-fg border-2 border-bg"></span>
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1 py-0.5">
            <div className="flex items-center gap-2">
              <div className="text-fg flex items-center gap-1.5 text-sm font-semibold tabular-nums">
                <RuleIcon className="text-fg-muted size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{describe(alert)}</span>
              </div>
              <div className="flex items-center gap-1 ml-1.5">
                {alert.channels.includes('email') && (
                  <IconMail className="text-fg-muted size-3.5" strokeWidth={2} />
                )}
                {alert.channels.includes('telegram') && (
                  <IconArrowRight className="text-fg size-3.5" strokeWidth={2} />
                )}
              </div>
            </div>
            <p className="text-fg-subtle mt-1.5 truncate text-xs font-medium">
              {alert.firedAt
                ? `Triggered ${formatRelative(alert.firedAt)}`
                : alert.active
                  ? `Watching since ${formatRelative(alert.createdAt)}`
                  : `Paused`}
              {alert.note ? <span className="text-fg-muted"> · {alert.note}</span> : ''}
            </p>
          </div>

          <div className="flex shrink-0 gap-1 md:flex">
            <Tooltip label={alert.active ? 'Pause' : 'Re-arm'}>
              <button
                type="button"
                onClick={onToggle}
                aria-label={alert.active ? 'Pause alert' : 'Re-arm alert'}
                className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 inline-flex size-10 items-center justify-center rounded-sm transition-colors"
              >
                {alert.active ? <IconBellOff className="size-4" /> : <IconRefresh className="size-4" />}
              </button>
            </Tooltip>
            <Tooltip label="Delete">
              <button
                type="button"
                onClick={onDelete}
                aria-label="Delete alert"
                className="text-danger/70 hover:text-danger hover:bg-danger/10 inline-flex size-10 items-center justify-center rounded-sm transition-colors"
              >
                <IconTrash className="size-4" />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Right Option (Delete) */}
        <div 
          className="flex w-full items-center justify-end pr-6 bg-danger/10 text-danger"
          style={{ scrollSnapAlign: 'end' }}
        >
          <IconTrash className="size-5 animate-pulse" />
        </div>
      </div>
    </li>
  );
}

function ruleIcon(a: Alert) {
  switch (a.rule.type) {
    case 'priceCross':
      return IconTrendingUp;
    case 'indicatorCross':
      return IconActivity;
    case 'candleClose':
      return IconChartBar;
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
