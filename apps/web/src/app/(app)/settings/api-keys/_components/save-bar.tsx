'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
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

export function SaveBar({ action, preservedPrompt, children }: SaveBarProps) {
  const [state, formAction, isPending] = useActionState<SaveKeysResult, FormData>(
    action,
    { status: 'idle' },
  );
  const lastSeenAt = useRef<number | null>(null);
  const lastErrorSeen = useRef<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Success toast — dedupe so React strict-mode re-renders don't toast twice.
  useEffect(() => {
    if (state.status !== 'success') return;
    if (lastSeenAt.current === state.at) return;
    lastSeenAt.current = state.at;
    if (state.savedCount === 0 && state.clearedCount === 0) {
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
    setIsDirty(false);
  }, [state]);

  // Error toast.
  useEffect(() => {
    if (state.status !== 'error') return;
    if (lastErrorSeen.current === state.message) return;
    lastErrorSeen.current = state.message;
    toast.error(`Save failed: ${state.message}`);
  }, [state]);

  // Unsaved changes beforeunload warning
  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const handleFormChange = () => {
    setIsDirty(true);
  };

  const handleDiscard = () => {
    window.location.reload();
  };

  return (
    <form
      action={formAction}
      onChange={handleFormChange}
      className="flex flex-col gap-8"
    >
      {children}
      <div className="flex items-center gap-3 justify-end">
        {state.status === 'success' ? (
          <span className="flex items-center gap-1.5 text-caption text-bull">
            <CheckCircle2 size={14} aria-hidden="true" />
            Saved
          </span>
        ) : null}
        {isDirty && (
          <Button
            type="button"
            variant="ghost"
            onClick={handleDiscard}
            disabled={isPending}
            className="text-fg-muted hover:text-fg"
          >
            Discard
          </Button>
        )}
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