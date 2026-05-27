'use client';

// <ConfirmDrawer> — drawer-based confirmation dialog. Replaces native
// `window.confirm()` calls so destructive actions stay within the app's
// glass aesthetic.
//
// Two ways to use it:
//
// 1. Controlled — pass `open` + `onOpenChange`, render trigger separately:
//      <ConfirmDrawer
//        open={open}
//        onOpenChange={setOpen}
//        title="Delete conversation?"
//        description="This permanently removes the thread and all messages."
//        confirmLabel="Delete"
//        tone="danger"
//        onConfirm={() => deleteThread()}
//      />
//
// 2. Imperative via the `useConfirm()` hook — returns a `confirm(opts)`
//    promise that resolves `true` on confirm, `false` otherwise. Renders
//    its own portal-mounted drawer.

import { AlertTriangle } from 'lucide-react';
import { useCallback, useState } from 'react';

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { cn } from '@/lib/cn';

import { Button } from './button';

type Tone = 'danger' | 'default';

interface ConfirmDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDrawer({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  busy,
  onConfirm,
}: ConfirmDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <div className="flex items-center gap-3">
            {tone === 'danger' ? (
              <span
                aria-hidden
                className="text-bear inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: 'oklch(68% 0.24 25 / 0.12)' }}
              >
                <AlertTriangle className="size-5" strokeWidth={2} />
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              <DrawerTitle>{title}</DrawerTitle>
              {description ? (
                <DrawerDescription className="mt-1">{description}</DrawerDescription>
              ) : null}
            </div>
          </div>
        </DrawerHeader>
        <DrawerFooter>
          <Button
            type="button"
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="md"
            disabled={busy}
            onClick={() => void onConfirm()}
            className={cn('w-full', busy && 'opacity-70')}
          >
            {busy ? `${confirmLabel}…` : confirmLabel}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="md"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="w-full"
          >
            {cancelLabel}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Imperative API — useConfirm()
// ---------------------------------------------------------------------------

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
  resolve?: (v: boolean) => void;
}

/**
 * Returns `[confirmEl, confirm]` — render `confirmEl` once near the root,
 * call `await confirm({ ... })` anywhere to prompt and await user choice.
 */
export function useConfirm(): readonly [React.ReactNode, (opts: ConfirmOptions) => Promise<boolean>] {
  const [state, setState] = useState<ConfirmState>({ open: false, title: '' });
  const [busy, setBusy] = useState(false);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({ ...opts, open: true, resolve });
    });
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        state.resolve?.(false);
        setState((s) => {
          const { resolve: _drop, ...rest } = s;
          return { ...rest, open: false };
        });
      }
    },
    [state],
  );

  const handleConfirm = useCallback(async () => {
    setBusy(true);
    try {
      state.resolve?.(true);
    } finally {
      setBusy(false);
      setState((s) => {
        const { resolve: _drop, ...rest } = s;
        return { ...rest, open: false };
      });
    }
  }, [state]);

  const node = (
    <ConfirmDrawer
      open={state.open}
      onOpenChange={handleOpenChange}
      title={state.title}
      {...(state.description !== undefined ? { description: state.description } : {})}
      {...(state.confirmLabel !== undefined ? { confirmLabel: state.confirmLabel } : {})}
      {...(state.cancelLabel !== undefined ? { cancelLabel: state.cancelLabel } : {})}
      {...(state.tone !== undefined ? { tone: state.tone } : {})}
      busy={busy}
      onConfirm={handleConfirm}
    />
  );

  return [node, confirm] as const;
}
