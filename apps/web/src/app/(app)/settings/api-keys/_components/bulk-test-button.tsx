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

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, Play, XCircle } from 'lucide-react';

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

/**
 * <BulkTestButton> — Phase D api-keys page overhaul.
 *
 * Posts to /api/settings/bulk-test, which is the single source of
 * truth for the test + persist path. After a successful response we
 * call `router.refresh()` so the server-component page re-fetches
 * the latest provider_tests rows — no second writer, no race.
 *
 * (Earlier revisions also called a `bulkTestAll` server action that
 * re-wrote the same rows. That double-write could race with the API
 * route's delete-then-insert and silently drop the new rows.)
 */
export function BulkTestButton({ disabled }: BulkTestButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<BulkTestSummary | null>(null);

  function handleClick() {
    if (running) return;
    setRunning(true);
    setSummary(null);
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
        const body = (await res.json()) as {
          summary: BulkTestSummary;
          results: Array<{ provider: string; status: string; error?: string }>;
        };
        setSummary(body.summary);
        if (body.summary.failed === 0) {
          toast.success(
            `All ${body.summary.ok} configured providers are valid.`,
          );
        } else if (body.summary.ok === 0) {
          toast.error(
            `${body.summary.failed} providers failed. Check the errors below.`,
          );
        } else {
          toast.warning(
            `${body.summary.ok} ok, ${body.summary.failed} failed.`,
          );
        }
        // Refresh the RSC tree so the per-card health badges reflect
        // the new provider_tests rows without a manual reload.
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Bulk test failed',
        );
      } finally {
        setRunning(false);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleClick}
        disabled={disabled || running || isPending}
        loading={running || isPending}
      >
        {running || isPending ? (
          <>
            <Loader2 className="size-3 animate-spin" />
            Testing all…
          </>
        ) : (
          <>
            <Play className="size-3" />
            Test all
          </>
        )}
      </Button>
      {summary ? (
        <span className="flex items-center gap-1 text-caption tabular-nums">
          {summary.failed === 0 ? (
            <CheckCircle2 className="size-3 text-bull" />
          ) : (
            <XCircle className="size-3 text-bear" />
          )}
          <span className="text-fg-muted">
            {summary.ok}/{summary.total - summary.missing} ok
          </span>
        </span>
      ) : null}
    </div>
  );
}
