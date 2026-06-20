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
import { CheckCircle2, Loader2, Play, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface BulkTestButtonProps {
  /**
   * Server action returned by the page component. Calls
   * /api/settings/bulk-test under the hood and persists the
   * resulting health snapshots.
   */
  action: () => Promise<void>;
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
 * Submits the bulk-test server action, parses the resulting
 * page re-render to surface a toast summarising how many
 * providers passed / failed. The page revalidation inside the
 * action refreshes each card's <StatusPill> automatically.
 *
 * We can't read the action's return value directly because Next
 * 15 server actions return void. Instead we re-fetch the catalog
 * endpoint to read the updated health snapshots. (The action's
 * `revalidatePath('/settings/api-keys')` causes the page props
 * to refresh too, but we need the data on the client for the toast.)
 */
export function BulkTestButton({ action, disabled }: BulkTestButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<BulkTestSummary | null>(null);

  function handleClick() {
    if (running) return;
    setRunning(true);
    setSummary(null);
    startTransition(async () => {
      try {
        // Call the API directly so we can read the response. The
        // server action runs the same code path on the server.
        const res = await fetch('/api/settings/bulk-test', {
          method: 'POST',
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
        // Tell the server action to run too — it persists the
        // health snapshot rows that the page reads from. The two
        // writes are idempotent (the API also writes; the action
        // writes the same data again). If the server action is
        // racey with the API write, the worst case is one extra
        // identical row, which is harmless.
        try {
          await action();
        } catch {
          /* page still refreshes via API write */
        }
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
