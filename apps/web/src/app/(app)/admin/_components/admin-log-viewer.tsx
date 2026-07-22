// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';

export function AdminLogViewer() {
  const [lines, setLines] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  function disconnect() {
    sourceRef.current?.close();
    sourceRef.current = null;
    setConnected(false);
  }

  function connect() {
    if (process.env.NODE_ENV === 'production') {
      setError('Log streaming is only available in development.');
      return;
    }

    disconnect();
    setError(null);

    const source = new EventSource('/api/admin/logs/stream');
    sourceRef.current = source;
    setConnected(true);

    source.onmessage = (event) => {
      setLines((prev) => {
        const next = [...prev, event.data];
        if (next.length > 200) next.shift();
        return next;
      });
    };

    source.onerror = () => {
      disconnect();
      setError('Log stream disconnected. Ensure ENABLE_LOG_STREAM=true.');
    };
  }

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return (
    <SettingsSection
      title="Log Stream"
      description={`Real-time log stream. ${connected ? 'Connected' : 'Disconnected'}.`}
    >
      <div className="border-border bg-bg-elev-1 flex h-[400px] flex-col gap-2 overflow-hidden rounded-sm border p-2 font-mono text-xs">
        {!connected && !error ? (
          <div className="flex h-full items-center justify-center">
            <Button variant="secondary" onClick={connect}>
              Connect to log stream
            </Button>
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <p className="text-danger">{error}</p>
            <Button variant="secondary" onClick={connect}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="flex h-full flex-col gap-0.5 overflow-y-auto p-2">
            {lines.length === 0 ? (
              <p className="text-fg-subtle">Waiting for log lines...</p>
            ) : (
              lines.map((line, i) => (
                <pre key={i} className="whitespace-pre-wrap break-all text-fg-subtle">
                  {line}
                </pre>
              ))
            )}
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
