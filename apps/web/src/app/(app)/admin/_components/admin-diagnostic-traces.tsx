// SPDX-License-Identifier: Apache-2.0

'use client';

import { useCallback, useEffect, useState } from 'react';
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
} from '@tabler/icons-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { formatRelativeTime, formatAbsoluteTime, downloadCSV } from '@/lib/format-number';
import type { DiagnosticTraceDetail, DiagnosticTraceSummary } from '@/lib/services/admin-dtos';

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

function DetailItem({ label, children }: { label: string; children: React.ReactNode }) {
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
        <span className="text-fg text-sm font-medium">
          {index + 1}. {step.name}
        </span>
        <Badge
          tone={step.status === 'failed' ? 'danger' : step.status === 'completed' ? 'success' : 'warn'}
        >
          {step.status}
        </Badge>
      </div>
      {typeof step.durationMs === 'number' && (
        <p className="text-fg-subtle text-xs">{step.durationMs} ms</p>
      )}
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
      {error.stack && (
        <pre className="mt-1 overflow-x-auto rounded-sm bg-bg-elev-1 p-2 text-xs text-fg-subtle">
          {error.stack}
        </pre>
      )}
      <p className="text-fg-subtle mt-1 text-xs" title={formatAbsoluteTime(ts.toISOString())}>
        {formatRelativeTime(ts.toISOString())}
      </p>
    </div>
  );
}

export function AdminDiagnosticTraces() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const traceIdFromUrl = searchParams.get('trace');

  const [traces, setTraces] = useState<DiagnosticTraceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detail, setDetail] = useState<DiagnosticTraceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const fetchTraces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ traces: DiagnosticTraceSummary[] }>(
        '/api/admin/diagnostics/traces?limit=20',
      );
      setTraces(data.traces);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      toastApiError(err, 'Failed to load diagnostic traces');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const data = await apiFetch<{ trace: DiagnosticTraceDetail }>(
        `/api/admin/diagnostics/trace/${id}`,
      );
      setDetail(data.trace);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setDetailError(msg);
      toastApiError(err, 'Failed to load trace detail');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTraces();
  }, [fetchTraces]);

  useEffect(() => {
    if (traceIdFromUrl) {
      void fetchDetail(traceIdFromUrl);
    } else {
      setDetail(null);
      setDetailError(null);
    }
  }, [traceIdFromUrl, fetchDetail]);

  const openTrace = useCallback(
    (id: string) => {
      router.push(`/admin?tab=traces&trace=${id}`);
    },
    [router],
  );

  const closeTrace = useCallback(() => {
    router.push('/admin?tab=traces');
  }, [router]);

  const handleCopy = useCallback(async (text: string, label: string) => {
    await copyToClipboard(text);
    toast.success(`${label} copied to clipboard`);
  }, []);

  function handleExport() {
    downloadCSV(
      traces.map((t) => ({
        threadId: t.threadId,
        stepCount: t.stepCount,
        errorCount: t.errorCount,
        startedAt: t.startedAt,
      })),
      `diagnostic-traces-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }

  if (loading) {
    return <SkeletonCard lines={4} />;
  }

  if (error) {
    return (
      <SettingsSection title="Diagnostic Traces" description="Recent chat diagnostic traces.">
        <AdminErrorBlock message={error} onRetry={() => void fetchTraces()} />
      </SettingsSection>
    );
  }

  const description = 'Recent chat diagnostic traces.';

  return (
    <>
      <SettingsSection title="Diagnostic Traces" description={description}>
        <div className="flex justify-end gap-2 pb-3">
          <Button variant="secondary" size="sm" onClick={() => void fetchTraces()}>
            Refresh
          </Button>
          {traces.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleExport}>
              <IconDownload className="size-4" aria-hidden="true" />
              CSV
            </Button>
          )}
        </div>
        <div className="border-border overflow-x-auto overflow-hidden rounded-sm border">
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
                  <td colSpan={4} className="px-4 py-6">
                    <EmptyState
                      icon={<IconStethoscope className="size-6" />}
                      title="No traces found"
                      description="Diagnostic traces will appear here after chat sessions complete."
                      bare
                    />
                  </td>
                </tr>
              ) : (
                traces.map((trace) => (
                  <tr
                    key={trace.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open trace ${trace.id}`}
                    className="border-border hover:bg-bg-elev-1 cursor-pointer border-t outline-none focus-visible:bg-bg-elev-2 focus-visible:ring-2 focus-visible:ring-brand/50"
                    onClick={() => openTrace(trace.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openTrace(trace.id);
                      }
                    }}
                  >
                    <td className="text-fg px-4 py-2 font-mono text-xs">{trace.threadId}</td>
                    <td className="text-fg-subtle px-4 py-2 tabular-nums">{trace.stepCount}</td>
                    <td className="px-4 py-2">
                      <Badge tone={trace.errorCount > 0 ? 'danger' : 'success'}>
                        {trace.errorCount}
                      </Badge>
                    </td>
                    <td className="text-fg-subtle px-4 py-2">
                      <span title={formatAbsoluteTime(trace.startedAt)}>
                        {formatRelativeTime(trace.startedAt)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SettingsSection>

      <Drawer open={!!traceIdFromUrl} onOpenChange={(open) => !open && closeTrace()}>
        <DrawerContent className="max-h-[92vh] overflow-y-auto">
          <DrawerHeader className="flex items-start justify-between">
            <div>
              <DrawerTitle className="flex items-center gap-2">
                <IconTimeline className="size-5" aria-hidden="true" />
                Trace detail
              </DrawerTitle>
              <DrawerDescription>Steps, timings, and errors for this chat turn.</DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button variant="ghost" size="sm" className="h-10 w-10 p-0" aria-label="Close trace detail">
                <IconX className="size-4" aria-hidden="true" />
              </Button>
            </DrawerClose>
          </DrawerHeader>

          <div className="flex flex-col gap-4 px-4 pb-6">
            {detailLoading ? (
              <SkeletonCard lines={4} />
            ) : detailError ? (
              <div className="border-border bg-bg-elev-1 rounded-sm border p-4">
                <p className="text-danger text-sm">{detailError}</p>
              </div>
            ) : !detail ? (
              <EmptyState
                icon={<IconStethoscope className="size-6" />}
                title="No trace selected"
                description="Select a trace from the table to view details."
                bare
              />
            ) : (
              <>
                <div className="bg-bg-elev-1 border-border grid grid-cols-1 gap-3 rounded-sm border p-3 sm:grid-cols-2">
                  <DetailItem label="Trace ID">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs break-all">{detail.id}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-10 w-10 p-0"
                        aria-label="Copy trace ID"
                        onClick={() => void handleCopy(detail.id, 'Trace ID')}
                      >
                        <IconCopy className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </DetailItem>
                  <DetailItem label="Thread ID">
                    <div className="flex items-center gap-2">
                      <IconHash className="size-3 text-fg-subtle" aria-hidden="true" />
                      <span className="font-mono text-xs break-all">{detail.threadId}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-10 w-10 p-0"
                        aria-label="Copy thread ID"
                        onClick={() => void handleCopy(detail.threadId, 'Thread ID')}
                      >
                        <IconCopy className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </DetailItem>
                  <DetailItem label="User ID">
                    <div className="flex items-center gap-2">
                      <IconUser className="size-3 text-fg-subtle" aria-hidden="true" />
                      <span className="font-mono text-xs break-all">{detail.userId}</span>
                    </div>
                  </DetailItem>
                  <DetailItem label="Started">
                    <span className="text-xs" title={formatAbsoluteTime(detail.startedAt)}>
                      {formatRelativeTime(detail.startedAt)}
                    </span>
                  </DetailItem>
                  {typeof detail.durationMs === 'number' && (
                    <DetailItem label="Duration">
                      <span className="text-xs">{detail.durationMs} ms</span>
                    </DetailItem>
                  )}
                  <DetailItem label="Status">
                    <Badge tone={detail.status === 'failed' ? 'danger' : 'success'}>
                      {detail.status}
                    </Badge>
                  </DetailItem>
                </div>

                {detail.errors.length > 0 && (
                  <div className="border-danger/20 rounded-sm border bg-bg-elev-1 p-3">
                    <h4 className="mb-2 text-sm font-semibold text-danger">
                      Errors ({detail.errors.length})
                    </h4>
                    <div className="flex flex-col gap-3">
                      {detail.errors.map((err, i) => (
                        <ErrorRow key={i} error={err} />
                      ))}
                    </div>
                  </div>
                )}

                <div className="border-border rounded-sm border bg-bg-elev-1 p-3">
                  <h4 className="mb-2 text-sm font-semibold">
                    Steps ({detail.steps.length})
                  </h4>
                  {detail.steps.length === 0 ? (
                    <p className="text-fg-subtle text-sm">No steps recorded.</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {detail.steps.map((step, i) => (
                        <StepRow key={i} step={step} index={i} />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
