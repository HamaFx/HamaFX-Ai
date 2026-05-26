'use client';

// Client island for the settings page that triggers a one-shot Telegram
// test message via `/api/admin/test-telegram`. Mirrors the existing
// `TestEmailButton` in shape, copy, and three-state result rendering.
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';

type Result =
  | { kind: 'idle' }
  | { kind: 'sent'; id: string }
  | { kind: 'missing'; vars: string[] }
  | { kind: 'error'; message: string };

interface SuccessBody {
  id?: string | null;
}

interface MissingBody {
  missing?: unknown;
}

interface ErrorBody {
  error?: unknown;
}

export function TestTelegramButton(): React.JSX.Element {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result>({ kind: 'idle' });

  function send(): void {
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/test-telegram', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });

        if (res.ok) {
          const json = (await res.json().catch(() => ({}))) as SuccessBody;
          setResult({ kind: 'sent', id: json.id ?? 'unknown' });
          return;
        }

        if (res.status === 503) {
          const json = (await res.json().catch(() => ({}))) as MissingBody;
          const vars = Array.isArray(json.missing)
            ? json.missing.filter((v): v is string => typeof v === 'string')
            : [];
          setResult({ kind: 'missing', vars });
          return;
        }

        let message = `HTTP ${res.status}`;
        const text = await res.text().catch(() => '');
        if (text) {
          try {
            const parsed = JSON.parse(text) as ErrorBody;
            if (typeof parsed.error === 'string' && parsed.error) {
              message = parsed.error;
            } else {
              message = text;
            }
          } catch {
            message = text;
          }
        }
        setResult({ kind: 'error', message: message.slice(0, 200) });
      } catch (err) {
        setResult({
          kind: 'error',
          message: err instanceof Error ? err.message : 'unknown error',
        });
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="secondary"
        onClick={send}
        loading={pending}
        aria-busy={pending}
        className="focus-visible:ring-brand focus-visible:ring-offset-bg min-h-[44px] min-w-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        {pending ? 'Sending…' : 'Send test Telegram message'}
      </Button>

      <p role="status" aria-live="polite" className="text-fg-muted min-h-[1.25rem] text-sm">
        {result.kind === 'sent' ? (
          <span className="text-fg-muted">
            Sent · message id: <span className="tabular-nums">{result.id}</span>
          </span>
        ) : result.kind === 'missing' ? (
          <span className="text-warn">Missing env: {result.vars.join(', ')}</span>
        ) : result.kind === 'error' ? (
          <span className="text-bear">Error: {result.message}</span>
        ) : null}
      </p>
    </div>
  );
}
