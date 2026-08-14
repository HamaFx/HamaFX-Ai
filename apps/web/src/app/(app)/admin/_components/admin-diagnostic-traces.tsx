// SPDX-License-Identifier: Apache-2.0

'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  IconStethoscope,
  IconCopy,
  IconX,
  IconTimeline,
  IconBug,
  IconUser,
  IconHash,
  IconDownload,
  IconSearch,
  IconRefresh,
} from '@tabler/icons-react';
import { toast } from 'sonner';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCard } from '@/components/ui/skeleton';
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { AdminErrorBlock } from './admin-error-block';
import { apiFetch } from '@/lib/api-client';
import { toastApiError } from '@/lib/toast-api-error';
import { formatRelativeTime, formatAbsoluteTime, formatMs, downloadCSV } from '@/lib/format-number';
import type {
  DiagnosticTraceDetail,
  TraceExplorerEvent,
  TraceExplorerResponse,
} from '@/lib/services/admin-dtos';

interface ExplorerFilters {
  traceId?: string;
  runId?: string;
  jobId?: string;
  threadId?: string;
  messageId?: string;
}

const FILTER_FIELDS: Array<{ key: keyof ExplorerFilters; label: string; placeholder: string }> = [
  { key: 'traceId', label: 'Trace ID', placeholder: 'trace UUID' },
  { key: 'runId', label: 'Run ID', placeholder: 'worker run' },
  { key: 'jobId', label: 'Job ID', placeholder: 'analysis job' },
  { key: 'threadId', label: 'Thread ID', placeholder: 'thread UUID' },
  { key: 'messageId', label: 'Message ID', placeholder: 'message UUID' },
];

function sourceTone(source: TraceExplorerEvent['source']): BadgeTone {
  if (source === 'tool') return 'brand';
  if (source === 'agent' || source === 'analysis-job') return 'success';
  if (source === 'budget' || source === 'outbox') return 'warn';
  return 'neutral';
}

function statusTone(status: string): BadgeTone {
  if (status === 'failed' || status === 'dead' || status === 'error') return 'danger';
  if (status === 'processing' || status === 'running' || status === 'pending') return 'warn';
  if (status === 'completed' || status === 'complete' || status === 'done') return 'success';
  return 'neutral';
}

function primaryCorrelation(event: TraceExplorerEvent): string | null {
  return event.traceId ?? event.jobId ?? event.runId ?? event.threadId ?? event.messageId;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-fg-subtle text-xs font-medium uppercase tracking-wide">{label}</span>
      <div className="text-fg text-sm">{children}</div>
    </div>
  );
}

function StepRow({ step, index }: { step: DiagnosticTraceDetail['steps'][number]; index: number }) {
  return (
    <div className="border-border border-l-2 pl-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-fg text-sm font-medium">{index + 1}. {step.name}</span>
        <Badge tone={step.status === 'failed' ? 'danger' : step.status === 'completed' ? 'success' : 'warn'}>
          {step.status}
        </Badge>
      </div>
      {typeof step.durationMs === 'number' && <p className="text-fg-subtle text-xs">{step.durationMs} ms</p>}
      {step.metadata && Object.keys(step.metadata).length > 0 && (
        <pre className="mt-1 overflow-x-auto rounded-sm bg-bg-elev-1 p-2 text-xs text-fg-subtle">
          {JSON.stringify(step.metadata, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ErrorRow({ error }: { error: DiagnosticTraceDetail['errors'][number] }) {
  const ts = new Date(error.timestamp);
  return (
    <div className="border-danger/30 border-l-2 pl-3">
      <div className="flex items-center gap-2">
        <IconBug className="text-danger size-4" aria-hidden="true" />
        <span className="text-danger text-sm font-medium">{error.name}</span>
      </div>
      <p className="text-fg text-sm">{error.message}</p>
      {error.stack && <pre className="mt-1 overflow-x-auto rounded-sm bg-bg-elev-1 p-2 text-xs text-fg-subtle">{error.stack}</pre>}
      <p className="text-fg-subtle mt-1 text-xs" title={formatAbsoluteTime(ts.toISOString())}>{formatRelativeTime(ts.toISOString())}</p>
    </div>
  );
}

function EventRow({ event, onOpen }: { event: TraceExplorerEvent; onOpen: (event: TraceExplorerEvent) => void }) {
  const correlation = primaryCorrelation(event);
  return (
    <tr
      tabIndex={0}
      role="button"
      aria-label={`Inspect ${event.name} ${event.status}`}
      className="border-border hover:bg-bg-elev-1 cursor-pointer border-t outline-none focus-visible:bg-bg-elev-2 focus-visible:ring-2 focus-visible:ring-brand/50"
      onClick={() => onOpen(event)}
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
          keyboardEvent.preventDefault();
          onOpen(event);
        }
      }}
    >
      <td className="px-3 py-2"><Badge tone={sourceTone(event.source)}>{event.source}</Badge></td>
      <td className="text-fg px-3 py-2 font-mono text-xs">{event.name}</td>
      <td className="px-3 py-2"><Badge tone={statusTone(event.status)}>{event.status}</Badge></td>
      <td className="text-fg-subtle max-w-36 truncate px-3 py-2 font-mono text-xs" title={correlation ?? undefined}>{correlation ?? '—'}</td>
      <td className="text-fg-subtle px-3 py-2 tabular-nums">{event.durationMs === null ? '—' : formatMs(event.durationMs)}</td>
      <td className="text-fg-subtle px-3 py-2" title={formatAbsoluteTime(event.timestamp)}>{formatRelativeTime(event.timestamp)}</td>
    </tr>
  );
}

export function AdminDiagnosticTraces() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const traceIdFromUrl = searchParams.get('trace') ?? searchParams.get('traceId');
  const traceIdQuery = searchParams.get('traceId');
  const runIdQuery = searchParams.get('runId');
  const jobIdQuery = searchParams.get('jobId');
  const threadIdQuery = searchParams.get('threadId');
  const messageIdQuery = searchParams.get('messageId');

  const [filters, setFilters] = useState<ExplorerFilters>(() => ({
    traceId: traceIdQuery ?? undefined,
    runId: runIdQuery ?? undefined,
    jobId: jobIdQuery ?? undefined,
    threadId: threadIdQuery ?? undefined,
    messageId: messageIdQuery ?? undefined,
  }));
  const [events, setEvents] = useState<TraceExplorerEvent[]>([]);
  const [stats, setStats] = useState<TraceExplorerResponse['stats']>({ total: 0, bySource: {}, failures: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detail, setDetail] = useState<DiagnosticTraceDetail | null>(null);
  const [detailEvents, setDetailEvents] = useState<TraceExplorerEvent[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailRequestRef = useRef(0);
  const [detailError, setDetailError] = useState<string | null>(null);

  const fetchExplorer = useCallback(async (query: ExplorerFilters = {}) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '100' });
      for (const [key, value] of Object.entries(query)) {
        if (value) params.set(key, value);
      }
      const data = await apiFetch<TraceExplorerResponse>(`/api/admin/diagnostics/explorer?${params.toString()}`);
      setEvents(data.events);
      setStats(data.stats);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      toastApiError(err, 'Failed to load diagnostic timeline');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDetail = useCallback(async (id: string) => {
    const requestId = ++detailRequestRef.current;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const [detailResponse, explorerResponse] = await Promise.all([
        apiFetch<{ trace: DiagnosticTraceDetail }>(`/api/admin/diagnostics/trace/${id}`),
        apiFetch<TraceExplorerResponse>(`/api/admin/diagnostics/explorer?traceId=${encodeURIComponent(id)}&limit=100`),
      ]);
      if (requestId === detailRequestRef.current) {
        setDetail(detailResponse.trace);
        setDetailEvents(explorerResponse.events);
      }
    } catch (err) {
      if (requestId !== detailRequestRef.current) return;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setDetailError(msg);
      toastApiError(err, 'Failed to load trace detail');
    } finally {
      if (requestId === detailRequestRef.current) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchExplorer({
      traceId: traceIdQuery ?? undefined,
      runId: runIdQuery ?? undefined,
      jobId: jobIdQuery ?? undefined,
      threadId: threadIdQuery ?? undefined,
      messageId: messageIdQuery ?? undefined,
    });
  }, [fetchExplorer, traceIdQuery, runIdQuery, jobIdQuery, threadIdQuery, messageIdQuery]);

  useEffect(() => {
    if (traceIdFromUrl) {
      void fetchDetail(traceIdFromUrl);
    } else {
      detailRequestRef.current += 1;
      setDetail(null);
      setDetailEvents([]);
      setDetailError(null);
      setDetailLoading(false);
    }
  }, [traceIdFromUrl, fetchDetail]);

  const submitSearch = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams({ tab: 'traces' });
    for (const [key, value] of Object.entries(filters)) {
      if (value?.trim()) params.set(key, value.trim());
    }
    router.push(`/admin?${params.toString()}`);
  }, [filters, router]);

  const clearSearch = useCallback(() => {
    setFilters({});
    router.push('/admin?tab=traces');
  }, [router]);

  const openEvent = useCallback((event: TraceExplorerEvent) => {
    if (event.traceId) {
      router.push(`/admin?tab=traces&trace=${encodeURIComponent(event.traceId)}`);
      return;
    }
    const params = new URLSearchParams({ tab: 'traces' });
    if (event.runId) params.set('runId', event.runId);
    if (event.jobId) params.set('jobId', event.jobId);
    if (event.threadId) params.set('threadId', event.threadId);
    if (event.messageId) params.set('messageId', event.messageId);
    router.push(`/admin?${params.toString()}`);
  }, [router]);

  const closeTrace = useCallback(() => {
    router.push('/admin?tab=traces');
  }, [router]);

  const handleCopy = useCallback(async (text: string, label: string) => {
    await copyToClipboard(text);
    toast.success(`${label} copied to clipboard`);
  }, []);

  function handleExport() {
    downloadCSV(
      events.map((event) => ({
        source: event.source,
        name: event.name,
        status: event.status,
        traceId: event.traceId ?? '',
        runId: event.runId ?? '',
        jobId: event.jobId ?? '',
        threadId: event.threadId ?? '',
        messageId: event.messageId ?? '',
        durationMs: event.durationMs ?? '',
        timestamp: event.timestamp,
        error: event.error ?? '',
      })),
      `diagnostic-timeline-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }

  if (loading && events.length === 0) return <SkeletonCard lines={5} />;

  if (error && events.length === 0) {
    return (
      <SettingsSection title="Trace Explorer" description="Searchable AI execution timelines.">
        <AdminErrorBlock message={error} onRetry={() => void fetchExplorer(filters)} />
      </SettingsSection>
    );
  }

  return (
    <>
      <SettingsSection title="Trace Explorer" description="Search routing, agents, tools, budgets, persistence, and terminal status by correlation ID.">
        <form onSubmit={submitSearch} className="border-border bg-bg-elev-1 grid grid-cols-1 gap-3 rounded-sm border p-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Trace search">
          {FILTER_FIELDS.map(({ key, label, placeholder }) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-fg-subtle text-xs font-medium">{label}</span>
              <Input
                aria-label={label}
                placeholder={placeholder}
                value={filters[key] ?? ''}
                onChange={(inputEvent) => setFilters((current) => ({ ...current, [key]: inputEvent.target.value }))}
              />
            </label>
          ))}
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
            <Button type="submit" size="sm"><IconSearch className="size-4" aria-hidden="true" />Search</Button>
            <Button type="button" variant="ghost" size="sm" onClick={clearSearch}>Clear</Button>
            <Button type="button" variant="secondary" size="sm" className="ml-auto" onClick={() => void fetchExplorer(filters)}>
              <IconRefresh className="size-4" aria-hidden="true" />Refresh
            </Button>
            {events.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={handleExport}><IconDownload className="size-4" aria-hidden="true" />CSV</Button>}
          </div>
        </form>

        {error && <div className="border-warn/25 bg-warn/5 text-warn rounded-sm border px-3 py-2 text-xs" role="status">Refresh failed; showing the last successful timeline.</div>}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="border-border rounded-sm border p-3"><p className="text-fg-subtle text-xs">Events</p><p className="text-fg text-xl font-semibold tabular-nums">{stats.total}</p></div>
          <div className="border-border rounded-sm border p-3"><p className="text-fg-subtle text-xs">Failures</p><p className="text-danger text-xl font-semibold tabular-nums">{stats.failures}</p></div>
          <div className="border-border rounded-sm border p-3"><p className="text-fg-subtle text-xs">Agents</p><p className="text-fg text-xl font-semibold tabular-nums">{stats.bySource.agent ?? 0}</p></div>
          <div className="border-border rounded-sm border p-3"><p className="text-fg-subtle text-xs">Tools</p><p className="text-fg text-xl font-semibold tabular-nums">{stats.bySource.tool ?? 0}</p></div>
        </div>

        <div className="border-border overflow-x-auto overflow-hidden rounded-sm border">
          <table className="w-full text-sm">
            <caption className="sr-only">AI execution timeline</caption>
            <thead className="bg-bg-elev-2 text-fg-subtle">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Source</th>
                <th className="px-3 py-2 text-left font-medium">Event</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Correlation</th>
                <th className="px-3 py-2 text-left font-medium">Duration</th>
                <th className="px-3 py-2 text-left font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8"><EmptyState icon={<IconStethoscope className="size-6" />} title="No timeline events" description="Try a trace, run, job, thread, or message ID." bare /></td></tr>
              ) : events.map((event) => <EventRow key={event.id} event={event} onOpen={openEvent} />)}
            </tbody>
          </table>
        </div>
      </SettingsSection>

      <Drawer open={!!traceIdFromUrl} onOpenChange={(open) => !open && closeTrace()}>
        <DrawerContent className="max-h-[92vh] overflow-y-auto">
          <DrawerHeader className="flex items-start justify-between">
            <div>
              <DrawerTitle className="flex items-center gap-2"><IconTimeline className="size-5" aria-hidden="true" />Trace detail</DrawerTitle>
              <DrawerDescription>Steps, timings, correlated events, and errors for this chat turn.</DrawerDescription>
            </div>
            <DrawerClose asChild><Button variant="ghost" size="sm" className="h-10 w-10 p-0" aria-label="Close trace detail"><IconX className="size-4" aria-hidden="true" /></Button></DrawerClose>
          </DrawerHeader>

          <div className="flex flex-col gap-4 px-4 pb-6">
            {detailLoading ? <SkeletonCard lines={5} /> : detailError ? (
              <div className="border-border bg-bg-elev-1 rounded-sm border p-4"><p className="text-danger text-sm">{detailError}</p></div>
            ) : !detail ? (
              <EmptyState icon={<IconStethoscope className="size-6" />} title="No trace selected" description="Select a trace event from the timeline." bare />
            ) : (
              <>
                <div className="bg-bg-elev-1 border-border grid grid-cols-1 gap-3 rounded-sm border p-3 sm:grid-cols-2">
                  <DetailItem label="Trace ID"><div className="flex items-center gap-2"><span className="font-mono text-xs break-all">{detail.id}</span><Button variant="ghost" size="sm" className="h-10 w-10 p-0" aria-label="Copy trace ID" onClick={() => void handleCopy(detail.id, 'Trace ID')}><IconCopy className="size-4" aria-hidden="true" /></Button></div></DetailItem>
                  <DetailItem label="Thread ID"><div className="flex items-center gap-2"><IconHash className="size-3 text-fg-subtle" aria-hidden="true" /><span className="font-mono text-xs break-all">{detail.threadId}</span><Button variant="ghost" size="sm" className="h-10 w-10 p-0" aria-label="Copy thread ID" onClick={() => void handleCopy(detail.threadId, 'Thread ID')}><IconCopy className="size-4" aria-hidden="true" /></Button></div></DetailItem>
                  <DetailItem label="User ID"><div className="flex items-center gap-2"><IconUser className="size-3 text-fg-subtle" aria-hidden="true" /><span className="font-mono text-xs break-all">{detail.userId}</span></div></DetailItem>
                  <DetailItem label="Status"><Badge tone={statusTone(detail.status)}>{detail.status}</Badge></DetailItem>
                  <DetailItem label="Started"><span className="text-xs" title={formatAbsoluteTime(detail.startedAt)}>{formatRelativeTime(detail.startedAt)}</span></DetailItem>
                  {typeof detail.durationMs === 'number' && <DetailItem label="Duration"><span className="text-xs">{formatMs(detail.durationMs)}</span></DetailItem>}
                </div>

                <div className="border-border rounded-sm border bg-bg-elev-1 p-3">
                  <h4 className="mb-2 text-sm font-semibold">Correlated timeline ({detailEvents.length})</h4>
                  {detailEvents.length === 0 ? <p className="text-fg-subtle text-sm">No correlated rows found.</p> : <div className="flex flex-col gap-2">{detailEvents.map((event) => <div key={event.id} className="border-border flex items-center justify-between gap-2 border-l-2 pl-3"><div className="min-w-0"><div className="flex items-center gap-2"><Badge tone={sourceTone(event.source)}>{event.source}</Badge><span className="text-fg truncate font-mono text-xs">{event.name}</span></div>{event.error && <p className="text-danger mt-1 text-xs">{event.error}</p>}</div><Badge tone={statusTone(event.status)}>{event.status}</Badge></div>)}</div>}
                </div>

                {detail.errors.length > 0 && <div className="border-danger/20 rounded-sm border bg-bg-elev-1 p-3"><h4 className="mb-2 text-sm font-semibold text-danger">Errors ({detail.errors.length})</h4><div className="flex flex-col gap-3">{detail.errors.map((err, i) => <ErrorRow key={i} error={err} />)}</div></div>}

                <div className="border-border rounded-sm border bg-bg-elev-1 p-3"><h4 className="mb-2 text-sm font-semibold">Diagnostic steps ({detail.steps.length})</h4>{detail.steps.length === 0 ? <p className="text-fg-subtle text-sm">No steps recorded.</p> : <div className="flex flex-col gap-3">{detail.steps.map((step, i) => <StepRow key={i} step={step} index={i} />)}</div>}</div>
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
