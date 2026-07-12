'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {IconCircleCheck, IconLoader2, IconPlayerPlay, IconCircleX} from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { withCsrf } from '@/lib/csrf';
import { toast } from 'sonner';

interface BulkTestButtonProps {
  /** Disable when there are no keys configured. */
  disabled?: boolean;
}

interface BulkTestSummary {
  ok: number;
  failed: number;
  missing: number;
  total: number;
}

export function BulkTestButton({ disabled }: BulkTestButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<BulkTestSummary | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  function handleClick() {
    if (running) return;
    setRunning(true);
    setSummary(null);
    setProgress(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/settings/bulk-test', {
          method: 'POST',
          ...withCsrf(),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error('Streaming not supported by browser');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.trim()) continue;
            let parsed: Record<string, unknown>;
            try {
              parsed = JSON.parse(line) as Record<string, unknown>;
            } catch {
              console.error('Failed to parse streaming line:', line);
              continue;
            }
            if (parsed.type === 'progress') {
              setProgress({ current: parsed.current as number, total: parsed.total as number });
            } else if (parsed.type === 'done') {
              const summary = parsed.summary as BulkTestSummary;
              setSummary(summary);
              if (summary.failed === 0) {
                toast.success(
                  `All ${summary.ok} configured providers are valid.`,
                );
              } else if (summary.ok === 0) {
                toast.error(
                  `${summary.failed} providers failed. Check the errors below.`,
                );
              } else {
                toast.warning(
                  `${summary.ok} ok, ${summary.failed} failed.`,
                );
              }
            } else if (parsed.type === 'error') {
              throw new Error(parsed.message as string);
            }
          }
        }

        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Bulk test failed',
        );
      } finally {
        setRunning(false);
        setProgress(null);
      }
    });
  }

  const isLoading = running || isPending;

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleClick}
        disabled={disabled || isLoading}
        loading={isLoading}
      >
        {isLoading ? (
          <>
            <IconLoader2 className="size-3 animate-spin" />
            {progress ? `Testing (${progress.current}/${progress.total})…` : 'Testing all…'}
          </>
        ) : (
          <>
            <IconPlayerPlay className="size-3" />
            Test all
          </>
        )}
      </Button>
      {summary ? (
        <span className="flex items-center gap-1 text-caption tabular-nums">
          {summary.failed === 0 ? (
            <IconCircleCheck className="size-3 text-success" />
          ) : (
            <IconCircleX className="size-3 text-danger" />
          )}
          <span className="text-fg-muted">
            {summary.ok}/{summary.total - summary.missing} ok
          </span>
        </span>
      ) : null}
    </div>
  );
}
