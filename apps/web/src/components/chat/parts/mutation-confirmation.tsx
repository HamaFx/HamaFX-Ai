// SPDX-License-Identifier: Apache-2.0

// Confirmation card for Mastra mutation drafts (Phase 7).
//
// The chat route returns a `mutation-draft` event carrying the suspend
// payload (single-use token + summary). This card renders that payload and,
// on Confirm, posts the token to /api/chat/mutations/confirm which resumes
// the suspended workflow — re-validating the token (timing-safe digest +
// expiry) and the server-side mutation policy BEFORE the audited write
// executes. Nothing is written until this card's Confirm succeeds.

'use client';

import { useCallback, useEffect, useState } from 'react';

import type { MutationDraftPayload } from '@kestrel/shared';
import { MutationConfirmResultSchema } from '@kestrel/shared';
import { apiMutate } from '@/lib/api-client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';

const KIND_LABELS: Record<MutationDraftPayload['mutation'], string> = {
  set_alert: 'Alert',
  log_journal: 'Journal entry',
  share_snapshot: 'Share snapshot',
  run_system_action: 'System action',
};

const KIND_ICONS: Record<MutationDraftPayload['mutation'], string> = {
  set_alert: '🔔',
  log_journal: '📓',
  share_snapshot: '🔗',
  run_system_action: '⚙️',
};

type CardState =
  | { phase: 'idle' }
  | { phase: 'confirming' }
  | { phase: 'confirmed'; summary: string }
  | { phase: 'declined' }
  | { phase: 'error'; message: string };

interface MutationConfirmationCardProps {
  payload: MutationDraftPayload;
}

export function MutationConfirmationCard({ payload }: MutationConfirmationCardProps) {
  const [state, setState] = useState<CardState>({ phase: 'idle' });

  const confirm = useCallback(async () => {
    setState({ phase: 'confirming' });
    try {
      const json = await apiMutate('/api/chat/mutations/confirm', {
        method: 'POST',
        body: JSON.stringify({
          mutation: payload.mutation,
          runId: payload.runId,
          threadId: payload.threadId,
          confirmationToken: payload.confirmationToken,
        }),
      });
      const parsed = MutationConfirmResultSchema.safeParse(json);
      if (!parsed.success) {
        throw new Error('Confirmation returned an unexpected response.');
      }
      setState({
        phase: 'confirmed',
        summary: parsed.data.output?.summary ?? `${KIND_LABELS[payload.mutation]} confirmed`,
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Confirmation failed. The token may have expired — please retry the request.';
      setState({ phase: 'error', message });
    }
  }, [payload]);

  // Cancel is local: the single-use token simply expires and the server never
  // sees it. Nothing was written at draft time.
  const decline = useCallback(() => setState({ phase: 'declined' }), []);

  // When the token has expired, stop offering Confirm.
  const expired = payload.expiresAt <= Date.now();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expired) {
      const timer = window.setInterval(() => setNow(Date.now()), 5_000);
      return () => window.clearInterval(timer);
    }
  }, [expired]);

  const remainingMin = Math.max(0, Math.ceil((payload.expiresAt - now) / 60_000));

  if (state.phase === 'confirmed') {
    return (
      <Card as="section" className="border-border bg-bg-elev-1 p-3" aria-label="Mutation confirmed">
        <div className="flex items-start gap-2">
          <span aria-hidden className="text-base leading-6">
            ✅
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-fg-muted text-xs">{KIND_LABELS[payload.mutation]} confirmed</div>
            <div className="text-fg mt-0.5 break-words text-sm font-medium">{state.summary}</div>
          </div>
        </div>
      </Card>
    );
  }

  if (state.phase === 'declined') {
    return (
      <Card as="section" className="border-border bg-bg-elev-1 p-3" aria-label="Mutation declined">
        <div className="flex items-start gap-2">
          <span aria-hidden className="text-base leading-6">
            ✖️
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-fg-muted text-xs">Not executed</div>
            <div className="text-fg mt-0.5 text-sm">The {(KIND_LABELS[payload.mutation] ?? 'mutation').toLowerCase()} was cancelled. Nothing was changed.</div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      as="section"
      className="border-border bg-bg-elev-1 p-3"
      aria-label={`${KIND_LABELS[payload.mutation]} confirmation`}
    >
      <div className="flex items-start gap-2">
        <span aria-hidden className="text-base leading-6">
          {KIND_ICONS[payload.mutation]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-fg-muted text-xs">Confirmation required</div>
          <div className="text-fg mt-0.5 break-words text-sm font-medium">{payload.summary}</div>
          <div className="text-fg-muted mt-1 text-xs">
            {expired
              ? 'This confirmation has expired. Retry the request to get a fresh one.'
              : `Expires in ~${remainingMin} min · nothing is written until you confirm`}
          </div>
        </div>
      </div>

      {state.phase === 'error' && (
        <div role="alert" className="border-danger/30 bg-danger/10 text-danger mt-2 rounded-sm border px-2 py-1.5 text-xs">
          {state.message}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          onClick={confirm}
          disabled={state.phase === 'confirming' || expired}
          className={cn('min-h-[44px] min-w-[44px]')}
        >
          {state.phase === 'confirming' ? 'Confirming…' : (payload.confirmLabel ?? `Confirm ${KIND_LABELS[payload.mutation]}`)}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={decline}
          disabled={state.phase === 'confirming'}
          className={cn('min-h-[44px] min-w-[44px]')}
        >
          {payload.cancelLabel ?? 'Cancel'}
        </Button>
      </div>
    </Card>
  );
}
