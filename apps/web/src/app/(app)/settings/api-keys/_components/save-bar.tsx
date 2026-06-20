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

import { useActionState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

import type { SaveKeysResult } from '../page';

interface SaveBarProps {
  action: (
    prevState: SaveKeysResult,
    formData: FormData,
  ) => Promise<SaveKeysResult>;
  /**
   * When the user landed here from /chat with `?prompt=…`, show a
   * "Skip and continue" link alongside the Save button.
   */
  preservedPrompt?: string;
  /**
   * The card list goes inside the form element. We accept it as
   * children so this component can own the `<form action={formAction}>`
   * wiring that `useActionState` requires.
   */
  children: React.ReactNode;
}

/**
 * Phase D — gives the Save button the feedback it's been missing.
 *
 *   - "Saving…" with a spinner while the action is in flight
 *   - "Saved" toast on success (with the count of providers saved)
 *   - Error toast on failure
 *   - Inline "Saved" check next to the button
 *
 * Implementation note: the parent page is a server component, so we
 * can't use `useActionState` directly there. We pass the server action
 * down as a prop, and this small client component owns the form +
 * the pending/error/success lifecycle.
 */
export function SaveBar({ action, preservedPrompt, children }: SaveBarProps) {
  const [state, formAction, isPending] = useActionState<SaveKeysResult, FormData>(
    action,
    { status: 'idle' },
  );
  const lastSeenAt = useRef<number | null>(null);
  const lastErrorSeen = useRef<string | null>(null);

  // Success toast — dedupe so React strict-mode re-renders don't toast twice.
  useEffect(() => {
    if (state.status !== 'success') return;
    if (lastSeenAt.current === state.at) return;
    lastSeenAt.current = state.at;
    if (state.savedCount === 0 && state.clearedCount === 0) {
      // Form was submitted but nothing changed. Don't toast.
      return;
    }
    if (state.savedCount === 0) {
      toast.success(
        `Cleared ${state.clearedCount} provider${state.clearedCount === 1 ? '' : 's'}`,
      );
    } else {
      const clearedSuffix =
        state.clearedCount > 0 ? `, cleared ${state.clearedCount}` : '';
      toast.success(
        `Saved ${state.savedCount} provider${state.savedCount === 1 ? '' : 's'}${clearedSuffix}`,
      );
    }
  }, [state]);

  // Error toast.
  useEffect(() => {
    if (state.status !== 'error') return;
    if (lastErrorSeen.current === state.message) return;
    lastErrorSeen.current = state.message;
    toast.error(`Save failed: ${state.message}`);
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-8">
      {children}
      <div className="flex items-center gap-3 justify-end">
        {state.status === 'success' ? (
          <span className="flex items-center gap-1.5 text-caption text-bull">
            <CheckCircle2 size={14} aria-hidden="true" />
            Saved
          </span>
        ) : null}
        {preservedPrompt ? (
          <Link
            href={`/chat?prompt=${encodeURIComponent(preservedPrompt)}`}
            className="border border-divider bg-bg-elev-2 text-fg hover:bg-bg-elev-3 inline-flex h-12 items-center justify-center rounded-lg px-4 text-sm font-medium"
          >
            Skip and continue to chat
          </Link>
        ) : null}
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Saving…
            </>
          ) : (
            <>
              <Save size={16} aria-hidden="true" />
              Save Keys
            </>
          )}
        </Button>
      </div>
    </form>
  );
}