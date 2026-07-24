// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconTrash,
  IconDownload,
  IconSearch,
} from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { cn } from '@/lib/cn';

type LogStatus = 'idle' | 'connecting' | 'connected' | 'not_enabled' | 'error';

const MAX_LINES = 200;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

function severityClass(line: string): string {
  if (/\b(?:ERROR|ERR|FATAL)\b/i.test(line)) return 'text-danger font-semibold';
  if (/\bWARN(?:ING)?\b/i.test(line)) return 'text-warn';
  return 'text-fg';
}

function downloadLog(lines: string[]) {
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hamafx-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.log`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function AdminLogViewer() {
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<LogStatus>('idle');
  const [notEnabledMsg, setNotEnabledMsg] = useState<string>('');
  const [isPaused, setIsPaused] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);

  const sourceRef = useRef<EventSource | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(false);

  // Keep pausedRef in sync so the message handler reads the latest value.
  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

  const disconnect = useCallback(() => {
    if (reconnectTimeout.current !== null) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
    sourceRef.current?.close();
    sourceRef.current = null;
    reconnectAttempt.current = 0;
  }, []);

  const connect = useCallback(async () => {
    disconnect();
    setNotEnabledMsg('');
    setStatus('connecting');

    // Pre-flight: fetch to distinguish 503 (not enabled) from network errors.
    try {
      const res = await fetch('/api/admin/logs/stream', { method: 'GET' });
      if (res.status === 503) {
        try {
          const body = await res.json();
          setNotEnabledMsg(
            typeof body?.error?.message === 'string'
              ? body.error.message
              : 'Log streaming is not enabled.',
          );
        } catch {
          setNotEnabledMsg('Log streaming is not enabled.');
        }
        setStatus('not_enabled');
        return;
      }
    } catch {
      // network error — EventSource will also fail, handled by onerror below.
    }

    const source = new EventSource('/api/admin/logs/stream');
    sourceRef.current = source;
    reconnectAttempt.current = 0;

    source.onopen = () => {
      setStatus('connected');
      reconnectAttempt.current = 0;
    };

    source.onmessage = (event) => {
      if (pausedRef.current) return;
      const line = typeof event.data === 'string' ? event.data : String(event.data);
      setLines((prev) => {
        const next = [...prev, line];
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
      });
    };

    source.onerror = () => {
      disconnect();
      if (status !== 'connecting') setStatus('error');
      // Exponential backoff reconnect
      const delay = Math.min(
        RECONNECT_MAX_MS,
        RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt.current),
      );
      reconnectAttempt.current++;
      reconnectTimeout.current = setTimeout(() => {
        void connect();
      }, delay);
    };
  }, [disconnect, status]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  // Autoscroll when new lines arrive
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ block: 'end' });
    }
  }, [lines, autoScroll]);

  function handleClear() {
    setLines([]);
  }

  function handleDownload() {
    downloadLog(lines);
  }

  const statusBadge = {
    idle: { label: 'Disconnected', color: 'bg-fg-subtle' },
    connecting: { label: 'Connecting…', color: 'bg-warn animate-pulse' },
    connected: { label: 'Connected', color: 'bg-success' },
    not_enabled: { label: 'Disabled', color: 'bg-fg-subtle' },
    error: { label: 'Disconnected', color: 'bg-danger' },
  }[status];

  const filteredLines = filterQuery
    ? lines.filter((l) => l.toLowerCase().includes(filterQuery.toLowerCase()))
    : lines;

  return (
    <SettingsSection
      title="Log Stream"
      description={
        status === 'connected'
          ? 'Live log stream. Connected.'
          : status === 'not_enabled'
            ? 'Log streaming is not available.'
            : 'Real-time server log stream.'
      }
    >
      <div className="flex flex-col gap-3">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-sm">
            <span className={cn('inline-block size-2 rounded-full', statusBadge.color)} />
            <span className="text-fg-subtle">{statusBadge.label}</span>
          </span>

          {status === 'idle' || status === 'error' ? (
            <Button variant="secondary" size="sm" onClick={() => void connect()}>
              Connect
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={disconnect} disabled={status !== 'connected' && status !== 'connecting'}>
              Disconnect
            </Button>
          )}

          <div className="flex items-center gap-1.5 border-border border-l pl-2 ml-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label={isPaused ? 'Resume' : 'Pause'}
              onClick={() => setIsPaused((p) => !p)}
            >
              {isPaused ? (
                <IconPlayerPlay className="size-4" aria-hidden="true" />
              ) : (
                <IconPlayerPause className="size-4" aria-hidden="true" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label="Clear logs"
              onClick={handleClear}
            >
              <IconTrash className="size-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label="Download logs"
              onClick={handleDownload}
            >
              <IconDownload className="size-4" aria-hidden="true" />
            </Button>
          </div>

          <div className="flex items-center gap-1.5 border-border border-l pl-2 ml-1">
            <IconSearch className="size-4 text-fg-subtle" aria-hidden="true" />
            <Input
              type="text"
              placeholder="Filter…"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="h-8 w-32 text-xs"
            />
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-fg-subtle text-xs">Auto-scroll</span>
            <Switch checked={autoScroll} onCheckedChange={setAutoScroll} srLabel="Auto-scroll" />
          </div>
        </div>

        {/* Log area */}
        <div className="border-border bg-bg-elev-1 flex h-[400px] flex-col overflow-hidden rounded-sm border font-mono text-xs">
          {status === 'not_enabled' ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4">
              <p className="text-fg-subtle text-sm">{notEnabledMsg || 'Log streaming is not enabled.'}</p>
            </div>
          ) : status === 'idle' ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-fg-subtle">Click Connect to start streaming.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-2">
              {filteredLines.length === 0 ? (
                <p className="text-fg-subtle p-2">
                  {status === 'connected' ? 'Waiting for log lines…' : 'No lines match the filter.'}
                </p>
              ) : (
                <>
                  {filteredLines.map((line, i) => (
                    <pre
                      key={`${status}-${i}`}
                      className={cn('whitespace-pre-wrap break-all py-px', severityClass(line))}
                    >
                      {line}
                    </pre>
                  ))}
                  <div ref={bottomRef} />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </SettingsSection>
  );
}
